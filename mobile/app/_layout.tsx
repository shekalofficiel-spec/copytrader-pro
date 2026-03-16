import { Stack } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import '../global.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10000, retry: 1 },
  },
})

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="tabs" />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}
