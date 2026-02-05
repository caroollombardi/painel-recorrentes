import { useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import NotFound from "./pages/NotFound";
import { DashboardData, parseCSVData } from "@/lib/data-parser";
import asanaData from "@/data/asana-data.csv?raw";

const queryClient = new QueryClient();

const App = () => {
  // Initialize with CSV data for backwards compatibility
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(() => {
    try {
      return parseCSVData(asanaData);
    } catch (e) {
      console.error('Error parsing initial CSV data:', e);
      return null;
    }
  });

  const handleDataUpdate = useCallback((data: DashboardData) => {
    setDashboardData(data);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Public route - Login */}
              <Route path="/auth" element={<Auth />} />
              
              {/* Protected routes */}
              <Route 
                path="/" 
                element={
                  <ProtectedRoute>
                    {dashboardData ? (
                      <Dashboard data={dashboardData} />
                    ) : (
                      <Navigate to="/admin" replace />
                    )}
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute requireAdmin>
                    <Home 
                      onDataUpdate={handleDataUpdate} 
                      hasData={dashboardData !== null}
                    />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/users" 
                element={
                  <ProtectedRoute requireAdmin>
                    <Users />
                  </ProtectedRoute>
                } 
              />
              
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
