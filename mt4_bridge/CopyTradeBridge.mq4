//+------------------------------------------------------------------+
//| CopyTrader Pro — MT4 Bridge Expert Advisor                       |
//| Exposes a mini HTTP server on localhost for Python connector      |
//| Install in: MetaTrader4/MQL4/Experts/                            |
//+------------------------------------------------------------------+
#property copyright "CopyTrader Pro"
#property version   "1.0"
#property strict

#include <WinUser32.mqh>

// ─── Settings ────────────────────────────────────────────────────────────────
input int    ServerPort    = 5555;
input int    MagicNumber   = 777777;
input string AllowedIPs    = "127.0.0.1";

// ─── Globals ─────────────────────────────────────────────────────────────────
int    g_socket       = INVALID_HANDLE;
int    g_server_socket = INVALID_HANDLE;
bool   g_running      = false;

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("[CopyTradeBridge] Starting on port ", ServerPort);
   g_running = true;
   EventSetMillisecondTimer(50); // Poll every 50ms
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   g_running = false;
   EventKillTimer();
   if (g_socket != INVALID_HANDLE)
      SocketClose(g_socket);
   Print("[CopyTradeBridge] Stopped");
}

//+------------------------------------------------------------------+
//| Timer event — accept connections and serve requests              |
//+------------------------------------------------------------------+
void OnTimer()
{
   if (!g_running) return;

   // Try to accept a new connection
   int client = SocketAccept(g_server_socket);
   if (client != INVALID_HANDLE)
   {
      string request = "";
      char buf[];
      int bytes_read = SocketRead(client, buf, 4096, 100);
      if (bytes_read > 0)
      {
         request = CharArrayToString(buf, 0, bytes_read);
         string response = HandleRequest(request);

         string http_response = "HTTP/1.1 200 OK\r\n"
                               + "Content-Type: application/json\r\n"
                               + "Access-Control-Allow-Origin: *\r\n"
                               + "Content-Length: " + IntegerToString(StringLen(response)) + "\r\n"
                               + "Connection: close\r\n"
                               + "\r\n"
                               + response;

         char resp[];
         StringToCharArray(http_response, resp, 0, StringLen(http_response));
         SocketSend(client, resp, ArraySize(resp) - 1);
      }
      SocketClose(client);
   }
}

//+------------------------------------------------------------------+
//| Route HTTP request to appropriate handler                        |
//+------------------------------------------------------------------+
string HandleRequest(string request)
{
   string method = "", path = "";

   // Parse method and path from first line
   int first_line_end = StringFind(request, "\r\n");
   string first_line = StringSubstr(request, 0, first_line_end);
   int space1 = StringFind(first_line, " ");
   int space2 = StringFind(first_line, " ", space1 + 1);
   method = StringSubstr(first_line, 0, space1);
   path   = StringSubstr(first_line, space1 + 1, space2 - space1 - 1);

   // Extract body for POST/PUT
   string body = "";
   int body_start = StringFind(request, "\r\n\r\n");
   if (body_start >= 0)
      body = StringSubstr(request, body_start + 4);

   Print("[Bridge] ", method, " ", path);

   if (path == "/ping")
      return "{\"status\":\"ok\",\"account\":\"" + AccountNumber() + "\"}";

   if (method == "GET" && path == "/positions")
      return GetPositions();

   if (method == "GET" && path == "/account")
      return GetAccountInfo();

   if (method == "POST" && path == "/order")
      return PlaceOrder(body);

   if (method == "POST" && path == "/close-all")
      return CloseAll();

   if (StringFind(path, "/close/") == 0 && method == "POST")
   {
      string ticket_str = StringSubstr(path, 7);
      int ticket = (int)StringToInteger(ticket_str);
      return ClosePosition(ticket);
   }

   if (StringFind(path, "/modify/") == 0 && method == "PUT")
   {
      string ticket_str = StringSubstr(path, 8);
      int ticket = (int)StringToInteger(ticket_str);
      return ModifyPosition(ticket, body);
   }

   return "{\"error\":\"not found\",\"path\":\"" + path + "\"}";
}

//+------------------------------------------------------------------+
//| Return all open positions as JSON array                          |
//+------------------------------------------------------------------+
string GetPositions()
{
   string result = "[";
   bool first = true;

   for (int i = 0; i < OrdersTotal(); i++)
   {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if (OrderType() > OP_SELL) continue; // Skip pending orders

      if (!first) result += ",";
      first = false;

      result += "{"
              + "\"ticket\":" + IntegerToString(OrderTicket()) + ","
              + "\"symbol\":\"" + OrderSymbol() + "\","
              + "\"type\":" + IntegerToString(OrderType()) + ","
              + "\"lots\":" + DoubleToString(OrderLots(), 2) + ","
              + "\"open_price\":" + DoubleToString(OrderOpenPrice(), 5) + ","
              + "\"sl\":" + DoubleToString(OrderStopLoss(), 5) + ","
              + "\"tp\":" + DoubleToString(OrderTakeProfit(), 5) + ","
              + "\"profit\":" + DoubleToString(OrderProfit(), 2) + ","
              + "\"swap\":" + DoubleToString(OrderSwap(), 2) + ","
              + "\"open_time\":" + IntegerToString(OrderOpenTime()) + ","
              + "\"comment\":\"" + OrderComment() + "\","
              + "\"magic\":" + IntegerToString(OrderMagicNumber())
              + "}";
   }

   result += "]";
   return result;
}

//+------------------------------------------------------------------+
//| Return account information as JSON                               |
//+------------------------------------------------------------------+
string GetAccountInfo()
{
   double margin_level = 0;
   if (AccountMargin() > 0)
      margin_level = AccountEquity() / AccountMargin() * 100;

   return "{"
         + "\"balance\":" + DoubleToString(AccountBalance(), 2) + ","
         + "\"equity\":" + DoubleToString(AccountEquity(), 2) + ","
         + "\"margin\":" + DoubleToString(AccountMargin(), 2) + ","
         + "\"margin_free\":" + DoubleToString(AccountFreeMargin(), 2) + ","
         + "\"margin_level\":" + DoubleToString(margin_level, 2) + ","
         + "\"profit\":" + DoubleToString(AccountProfit(), 2) + ","
         + "\"currency\":\"" + AccountCurrency() + "\","
         + "\"leverage\":" + IntegerToString(AccountLeverage()) + ","
         + "\"account_number\":" + IntegerToString(AccountNumber())
         + "}";
}

//+------------------------------------------------------------------+
//| Parse JSON value by key (simple string extraction)               |
//+------------------------------------------------------------------+
string ParseJsonString(string json, string key)
{
   string search = "\"" + key + "\":\"";
   int start = StringFind(json, search);
   if (start < 0)
   {
      // Try without quotes (for numbers/booleans)
      search = "\"" + key + "\":";
      start = StringFind(json, search);
      if (start < 0) return "";
      start += StringLen(search);
      int end = StringFind(json, ",", start);
      int end2 = StringFind(json, "}", start);
      if (end < 0 || (end2 >= 0 && end2 < end)) end = end2;
      if (end < 0) end = StringLen(json);
      return StringSubstr(json, start, end - start);
   }
   start += StringLen(search);
   int end = StringFind(json, "\"", start);
   if (end < 0) return "";
   return StringSubstr(json, start, end - start);
}

//+------------------------------------------------------------------+
//| Place a new order                                                |
//+------------------------------------------------------------------+
string PlaceOrder(string body)
{
   string symbol   = ParseJsonString(body, "symbol");
   int    type     = (int)StringToDouble(ParseJsonString(body, "type"));
   double lots     = StringToDouble(ParseJsonString(body, "lots"));
   double sl       = StringToDouble(ParseJsonString(body, "sl"));
   double tp       = StringToDouble(ParseJsonString(body, "tp"));
   string comment  = ParseJsonString(body, "comment");
   int    magic    = (int)StringToDouble(ParseJsonString(body, "magic"));

   if (symbol == "") symbol = Symbol();
   if (magic == 0)   magic = MagicNumber;
   if (comment == "") comment = "CopyTrader Pro";

   double price = (type == OP_BUY) ? Ask : Bid;

   int ticket = OrderSend(
      symbol,
      type,
      lots,
      price,
      30,    // slippage
      sl,
      tp,
      comment,
      magic,
      0,
      (type == OP_BUY) ? clrLime : clrRed
   );

   if (ticket > 0)
   {
      double open_price = 0;
      if (OrderSelect(ticket, SELECT_BY_TICKET))
         open_price = OrderOpenPrice();

      return "{\"ticket\":" + IntegerToString(ticket) + ",\"open_price\":" + DoubleToString(open_price, 5) + "}";
   }

   return "{\"ticket\":-1,\"error\":\"" + IntegerToString(GetLastError()) + "\"}";
}

//+------------------------------------------------------------------+
//| Close a specific position by ticket                              |
//+------------------------------------------------------------------+
string ClosePosition(int ticket)
{
   if (!OrderSelect(ticket, SELECT_BY_TICKET))
      return "{\"success\":false,\"error\":\"Ticket not found\"}";

   double price = (OrderType() == OP_BUY) ? Bid : Ask;
   bool success = OrderClose(ticket, OrderLots(), price, 30, clrWhite);

   if (success)
      return "{\"success\":true,\"ticket\":" + IntegerToString(ticket) + "}";

   return "{\"success\":false,\"error\":" + IntegerToString(GetLastError()) + "}";
}

//+------------------------------------------------------------------+
//| Close all open positions                                         |
//+------------------------------------------------------------------+
string CloseAll()
{
   int closed = 0;
   int errors = 0;

   for (int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if (OrderType() > OP_SELL) continue;

      double price = (OrderType() == OP_BUY) ? Bid : Ask;
      if (OrderClose(OrderTicket(), OrderLots(), price, 30, clrWhite))
         closed++;
      else
         errors++;
   }

   return "{\"success\":true,\"closed\":" + IntegerToString(closed) + ",\"errors\":" + IntegerToString(errors) + "}";
}

//+------------------------------------------------------------------+
//| Modify SL/TP of an existing order                                |
//+------------------------------------------------------------------+
string ModifyPosition(int ticket, string body)
{
   if (!OrderSelect(ticket, SELECT_BY_TICKET))
      return "{\"success\":false,\"error\":\"Ticket not found\"}";

   double sl = StringToDouble(ParseJsonString(body, "sl"));
   double tp = StringToDouble(ParseJsonString(body, "tp"));

   bool success = OrderModify(ticket, OrderOpenPrice(), sl, tp, 0, clrBlue);

   if (success)
      return "{\"success\":true}";

   return "{\"success\":false,\"error\":" + IntegerToString(GetLastError()) + "}";
}

//+------------------------------------------------------------------+
//| Chart event (not used)                                           |
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long& lparam, const double& dparam, const string& sparam) {}
void OnTick() {}

//+------------------------------------------------------------------+
//| Initialize TCP server socket                                     |
//| Note: SocketCreate/SocketBind require MT4 build 1220+           |
//+------------------------------------------------------------------+
int StartServer()
{
   g_server_socket = SocketCreate();
   if (g_server_socket == INVALID_HANDLE)
   {
      Print("[CopyTradeBridge] Failed to create socket: ", GetLastError());
      return -1;
   }

   if (!SocketBind(g_server_socket, "0.0.0.0", ServerPort))
   {
      Print("[CopyTradeBridge] Failed to bind on port ", ServerPort, ": ", GetLastError());
      return -1;
   }

   if (!SocketListen(g_server_socket, 10))
   {
      Print("[CopyTradeBridge] Failed to listen: ", GetLastError());
      return -1;
   }

   Print("[CopyTradeBridge] Listening on port ", ServerPort);
   return 0;
}
