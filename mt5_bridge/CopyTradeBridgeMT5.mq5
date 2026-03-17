//+------------------------------------------------------------------+
//|  CopyTrade Bridge MT5                                            |
//|  CopyTrader Pro — MT5 Expert Advisor Bridge                      |
//|  Supports MASTER (push trade events) and SLAVE (poll + execute)  |
//+------------------------------------------------------------------+
#property copyright "CopyTrader Pro"
#property link      "https://copytrader-pro-production.up.railway.app"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>

//--- Enums
enum ENUM_MODE
  {
   MODE_MASTER = 0,  // MASTER — push events to backend
   MODE_SLAVE  = 1,  // SLAVE  — poll backend for orders
  };

//+------------------------------------------------------------------+
//| Input parameters                                                 |
//+------------------------------------------------------------------+
input string   BackendURL      = "https://copytrader-pro-production.up.railway.app"; // Backend URL
input string   AccountToken    = "";        // Bearer token from CopyTrader Pro dashboard
input string   AccountID       = "";        // Account ID from CopyTrader Pro dashboard
input ENUM_MODE Mode           = MODE_MASTER; // EA mode
input int      PollIntervalMs  = 500;       // Poll interval (ms)
input int      MagicNumber     = 888888;    // Magic number for slave orders

//+------------------------------------------------------------------+
//| Globals                                                          |
//+------------------------------------------------------------------+
CTrade   g_Trade;
CPositionInfo g_Pos;

// Master state tracking
struct PositionSnapshot
  {
   ulong  ticket;
   string symbol;
   int    direction;   // POSITION_TYPE_BUY=0, POSITION_TYPE_SELL=1
   double lots;
   double openPrice;
   double sl;
   double tp;
   long   magic;
  };

PositionSnapshot g_PrevPositions[];
int              g_PrevCount = 0;

datetime g_LastPoll = 0;

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(AccountID == "" || AccountToken == "")
     {
      Alert("CopyTradeBridge: AccountID and AccountToken must be set in input parameters.");
      return(INIT_PARAMETERS_INCORRECT);
     }

   g_Trade.SetExpertMagicNumber(MagicNumber);
   g_Trade.SetDeviationInPoints(20);
   g_Trade.SetTypeFilling(ORDER_FILLING_IOC);

   string modeStr = (Mode == MODE_MASTER) ? "MASTER" : "SLAVE";
   PrintFormat("CopyTradeBridge v1.0 initialized | Mode: %s | AccountID: %s | Interval: %dms",
               modeStr, AccountID, PollIntervalMs);

   // Take initial snapshot of open positions (MASTER)
   if(Mode == MODE_MASTER)
      TakeSnapshot(g_PrevPositions, g_PrevCount);

   EventSetMillisecondTimer(PollIntervalMs);
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   PrintFormat("CopyTradeBridge stopped | reason=%d", reason);
  }

//+------------------------------------------------------------------+
//| Timer event — main heartbeat                                     |
//+------------------------------------------------------------------+
void OnTimer()
  {
   if(Mode == MODE_MASTER)
      MasterTick();
   else
      SlaveTick();
  }

//+------------------------------------------------------------------+
//| MASTER: compare current positions with previous snapshot         |
//+------------------------------------------------------------------+
void MasterTick()
  {
   PositionSnapshot currPositions[];
   int currCount = 0;
   TakeSnapshot(currPositions, currCount);

   // Detect NEW positions (ticket in curr but not in prev)
   for(int i = 0; i < currCount; i++)
     {
      if(!TicketExistsIn(currPositions[i].ticket, g_PrevPositions, g_PrevCount))
         OnNewPosition(currPositions[i]);
     }

   // Detect CLOSED positions (ticket in prev but not in curr)
   for(int i = 0; i < g_PrevCount; i++)
     {
      if(!TicketExistsIn(g_PrevPositions[i].ticket, currPositions, currCount))
         OnClosedPosition(g_PrevPositions[i]);
     }

   // Update snapshot
   ArrayResize(g_PrevPositions, currCount);
   for(int i = 0; i < currCount; i++)
      g_PrevPositions[i] = currPositions[i];
   g_PrevCount = currCount;
  }

//+------------------------------------------------------------------+
//| Take a snapshot of all open positions                            |
//+------------------------------------------------------------------+
void TakeSnapshot(PositionSnapshot &arr[], int &count)
  {
   count = PositionsTotal();
   ArrayResize(arr, count);
   for(int i = 0; i < count; i++)
     {
      string sym = PositionGetSymbol(i);
      if(sym == "")
        {
         count = i;
         break;
        }
      arr[i].ticket    = PositionGetInteger(POSITION_TICKET);
      arr[i].symbol    = sym;
      arr[i].direction = (int)PositionGetInteger(POSITION_TYPE);
      arr[i].lots      = PositionGetDouble(POSITION_VOLUME);
      arr[i].openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      arr[i].sl        = PositionGetDouble(POSITION_SL);
      arr[i].tp        = PositionGetDouble(POSITION_TP);
      arr[i].magic     = PositionGetInteger(POSITION_MAGIC);
     }
  }

//+------------------------------------------------------------------+
//| Check if ticket exists in array                                  |
//+------------------------------------------------------------------+
bool TicketExistsIn(ulong ticket, const PositionSnapshot &arr[], int count)
  {
   for(int i = 0; i < count; i++)
      if(arr[i].ticket == ticket)
         return true;
   return false;
  }

//+------------------------------------------------------------------+
//| MASTER: new position detected — push event to backend            |
//+------------------------------------------------------------------+
void OnNewPosition(const PositionSnapshot &pos)
  {
   string direction = (pos.direction == POSITION_TYPE_BUY) ? "BUY" : "SELL";
   string json = StringFormat(
                    "{\"event\":\"open\","
                    "\"account_id\":\"%s\","
                    "\"ticket\":%I64u,"
                    "\"symbol\":\"%s\","
                    "\"direction\":\"%s\","
                    "\"lots\":%.5f,"
                    "\"open_price\":%.5f,"
                    "\"sl\":%.5f,"
                    "\"tp\":%.5f,"
                    "\"magic\":%d}",
                    AccountID,
                    pos.ticket,
                    pos.symbol,
                    direction,
                    pos.lots,
                    pos.openPrice,
                    pos.sl,
                    pos.tp,
                    (int)pos.magic
                 );

   PrintFormat("MASTER | NEW position ticket=%I64u symbol=%s dir=%s lots=%.2f",
               pos.ticket, pos.symbol, direction, pos.lots);
   PostEvent(json);
  }

//+------------------------------------------------------------------+
//| MASTER: position closed — push event to backend                  |
//+------------------------------------------------------------------+
void OnClosedPosition(const PositionSnapshot &pos)
  {
   string direction = (pos.direction == POSITION_TYPE_BUY) ? "BUY" : "SELL";

   // Try to get close price from history
   double closePrice = 0.0;
   double profit     = 0.0;
   if(HistorySelectByPosition(pos.ticket))
     {
      int deals = HistoryDealsTotal();
      for(int i = deals - 1; i >= 0; i--)
        {
         ulong dealTicket = HistoryDealGetTicket(i);
         if(HistoryDealGetInteger(dealTicket, DEAL_ENTRY) == DEAL_ENTRY_OUT)
           {
            closePrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
            profit     = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
            break;
           }
        }
     }

   string json = StringFormat(
                    "{\"event\":\"close\","
                    "\"account_id\":\"%s\","
                    "\"ticket\":%I64u,"
                    "\"symbol\":\"%s\","
                    "\"direction\":\"%s\","
                    "\"lots\":%.5f,"
                    "\"open_price\":%.5f,"
                    "\"close_price\":%.5f,"
                    "\"sl\":%.5f,"
                    "\"tp\":%.5f,"
                    "\"magic\":%d,"
                    "\"profit\":%.2f}",
                    AccountID,
                    pos.ticket,
                    pos.symbol,
                    direction,
                    pos.lots,
                    pos.openPrice,
                    closePrice,
                    pos.sl,
                    pos.tp,
                    (int)pos.magic,
                    profit
                 );

   PrintFormat("MASTER | CLOSED position ticket=%I64u symbol=%s profit=%.2f",
               pos.ticket, pos.symbol, profit);
   PostEvent(json);
  }

//+------------------------------------------------------------------+
//| HTTP POST to /api/mt5/event                                      |
//+------------------------------------------------------------------+
void PostEvent(const string &json)
  {
   string url     = BackendURL + "/api/mt5/event";
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + AccountToken + "\r\n";
   char   body[];
   char   response[];
   string responseHeaders;

   StringToCharArray(json, body, 0, StringLen(json));

   int timeout = 5000;
   int httpCode = WebRequest("POST", url, headers, timeout, body, response, responseHeaders);

   if(httpCode < 0)
      PrintFormat("MASTER | WebRequest error=%d  (check Tools > Options > Expert Advisors > Allow WebRequest for: %s)", GetLastError(), BackendURL);
   else if(httpCode != 200 && httpCode != 201)
      PrintFormat("MASTER | Backend returned HTTP %d | response=%s", httpCode, CharArrayToString(response));
   else
      PrintFormat("MASTER | Event sent OK | HTTP %d", httpCode);
  }

//+------------------------------------------------------------------+
//| SLAVE: poll backend for pending orders, execute them             |
//+------------------------------------------------------------------+
void SlaveTick()
  {
   string url     = BackendURL + "/api/mt5/orders/" + AccountID;
   string headers = "Authorization: Bearer " + AccountToken + "\r\n";
   char   body[];
   char   response[];
   string responseHeaders;

   int timeout  = 5000;
   int httpCode = WebRequest("GET", url, headers, timeout, body, response, responseHeaders);

   if(httpCode < 0)
     {
      PrintFormat("SLAVE | WebRequest error=%d", GetLastError());
      return;
     }
   if(httpCode == 204)
      return; // No pending orders

   if(httpCode != 200)
     {
      PrintFormat("SLAVE | Unexpected HTTP %d from poll endpoint", httpCode);
      return;
     }

   string jsonResponse = CharArrayToString(response);
   if(jsonResponse == "" || jsonResponse == "[]" || jsonResponse == "null")
      return;

   // Parse the JSON array of orders
   // Format: [{"id":1,"symbol":"EURUSD","direction":"BUY","lots":1.0,"open_price":1.085,"sl":0,"tp":0,"magic":888888}, ...]
   ParseAndExecuteOrders(jsonResponse);
  }

//+------------------------------------------------------------------+
//| Parse JSON array of orders and execute each                      |
//| Minimal hand-rolled parser (avoids external dependencies)        |
//+------------------------------------------------------------------+
void ParseAndExecuteOrders(const string &json)
  {
   // Split on "},{" to get individual order objects
   string trimmed = json;
   // Strip leading/trailing whitespace and array brackets
   StringTrimLeft(trimmed);
   StringTrimRight(trimmed);
   if(StringGetCharacter(trimmed, 0) == '[')
      trimmed = StringSubstr(trimmed, 1, StringLen(trimmed) - 2);

   // Each object is {...}
   int pos = 0;
   int len = StringLen(trimmed);

   while(pos < len)
     {
      // Find start of object
      int objStart = StringFind(trimmed, "{", pos);
      if(objStart < 0) break;
      int objEnd = StringFind(trimmed, "}", objStart);
      if(objEnd < 0) break;

      string obj = StringSubstr(trimmed, objStart, objEnd - objStart + 1);

      long   orderId    = (long)ExtractLong(obj, "id");
      string symbol     = ExtractString(obj, "symbol");
      string direction  = ExtractString(obj, "direction");
      double lots       = ExtractDouble(obj, "lots");
      double openPrice  = ExtractDouble(obj, "open_price");
      double sl         = ExtractDouble(obj, "sl");
      double tp         = ExtractDouble(obj, "tp");
      int    magic      = (int)ExtractLong(obj, "magic");

      if(symbol != "" && (direction == "BUY" || direction == "SELL") && lots > 0)
         ExecuteOrder(orderId, symbol, direction, lots, sl, tp, magic);

      pos = objEnd + 1;
     }
  }

//+------------------------------------------------------------------+
//| Execute a single order on the slave account                      |
//+------------------------------------------------------------------+
void ExecuteOrder(long orderId, const string &symbol, const string &direction,
                  double lots, double sl, double tp, int magic)
  {
   g_Trade.SetExpertMagicNumber(magic > 0 ? magic : MagicNumber);

   ENUM_ORDER_TYPE orderType = (direction == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;

   bool ok = false;
   if(orderType == ORDER_TYPE_BUY)
      ok = g_Trade.Buy(lots, symbol, 0, sl, tp,
                       StringFormat("CopyTrader|id=%I64d", orderId));
   else
      ok = g_Trade.Sell(lots, symbol, 0, sl, tp,
                        StringFormat("CopyTrader|id=%I64d", orderId));

   uint retCode = g_Trade.ResultRetcode();

   if(ok || retCode == TRADE_RETCODE_DONE)
     {
      ulong slaveTicket = g_Trade.ResultOrder();
      PrintFormat("SLAVE | Executed order id=%I64d sym=%s dir=%s lots=%.2f ticket=%I64u",
                  orderId, symbol, direction, lots, slaveTicket);
      ConfirmOrder(orderId, slaveTicket, true, "");
     }
   else
     {
      string errMsg = StringFormat("retcode=%d desc=%s", retCode, g_Trade.ResultRetcodeDescription());
      PrintFormat("SLAVE | Failed to execute order id=%I64d | %s", orderId, errMsg);
      ConfirmOrder(orderId, 0, false, errMsg);
     }

   // Restore magic
   g_Trade.SetExpertMagicNumber(MagicNumber);
  }

//+------------------------------------------------------------------+
//| POST confirmation to backend                                     |
//+------------------------------------------------------------------+
void ConfirmOrder(long orderId, ulong slaveTicket, bool success, const string &errMsg)
  {
   string url     = BackendURL + "/api/mt5/confirm";
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + AccountToken + "\r\n";

   string safeErr = errMsg;
   StringReplace(safeErr, "\"", "'");

   string json = StringFormat(
                    "{\"order_id\":%I64d,"
                    "\"slave_account_id\":\"%s\","
                    "\"slave_ticket\":%I64u,"
                    "\"success\":%s,"
                    "\"error\":\"%s\"}",
                    orderId,
                    AccountID,
                    slaveTicket,
                    success ? "true" : "false",
                    safeErr
                 );

   char body[];
   char response[];
   string responseHeaders;
   StringToCharArray(json, body, 0, StringLen(json));

   int httpCode = WebRequest("POST", url, headers, 5000, body, response, responseHeaders);
   if(httpCode < 0)
      PrintFormat("SLAVE | Confirm WebRequest error=%d", GetLastError());
   else
      PrintFormat("SLAVE | Confirm sent HTTP %d for order id=%I64d", httpCode, orderId);
  }

//+------------------------------------------------------------------+
//| JSON helpers — extract typed values from a flat JSON object      |
//+------------------------------------------------------------------+
string ExtractString(const string &json, const string &key)
  {
   string search = "\"" + key + "\":\"";
   int start     = StringFind(json, search);
   if(start < 0) return "";
   start += StringLen(search);
   int end = StringFind(json, "\"", start);
   if(end < 0) return "";
   return StringSubstr(json, start, end - start);
  }

double ExtractDouble(const string &json, const string &key)
  {
   // Try quoted number first, then unquoted
   string search = "\"" + key + "\":";
   int start     = StringFind(json, search);
   if(start < 0) return 0.0;
   start += StringLen(search);
   // Skip optional quote
   if(StringGetCharacter(json, start) == '"') start++;
   int end = start;
   int len = StringLen(json);
   while(end < len)
     {
      ushort c = StringGetCharacter(json, end);
      if((c >= '0' && c <= '9') || c == '.' || c == '-')
         end++;
      else
         break;
     }
   return StringToDouble(StringSubstr(json, start, end - start));
  }

long ExtractLong(const string &json, const string &key)
  {
   string search = "\"" + key + "\":";
   int start     = StringFind(json, search);
   if(start < 0) return 0;
   start += StringLen(search);
   if(StringGetCharacter(json, start) == '"') start++;
   int end = start;
   int len = StringLen(json);
   while(end < len)
     {
      ushort c = StringGetCharacter(json, end);
      if((c >= '0' && c <= '9') || c == '-')
         end++;
      else
         break;
     }
   return StringToInteger(StringSubstr(json, start, end - start));
  }
//+------------------------------------------------------------------+
