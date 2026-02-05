import { useState, useCallback, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
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
          <Routes>
            <Route 
              path="/" 
              element={
                dashboardData ? (
                  <Dashboard data={dashboardData} />
                ) : (
                  <Navigate to="/admin" replace />
                )
              } 
            />
            <Route 
              path="/admin" 
              element={
                <Home 
                  onDataUpdate={handleDataUpdate} 
                  hasData={dashboardData !== null}
                />
              } 
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
