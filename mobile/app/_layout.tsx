import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { registerGlobals } from "@livekit/react-native";

registerGlobals();

export default function RootLayout() {
  return <><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, animation: "fade" }}><Stack.Screen name="index" /><Stack.Screen name="lobby" /><Stack.Screen name="meeting" /><Stack.Screen name="minutes" /><Stack.Screen name="history" /><Stack.Screen name="settings" /></Stack></>;
}
