import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Layout } from "@/components/Layout";
import Overview from "@/pages/Overview";
import Transactions from "@/pages/Transactions";
import Subscriptions from "@/pages/Subscriptions";
import Budget from "@/pages/Budget";
import Forecast from "@/pages/Forecast";
import Payments from "@/pages/Payments";
import CoastFire from "@/pages/CoastFire";
import Mortgage from "@/pages/Mortgage";
import Accounts from "@/pages/Accounts";
import Categories from "@/pages/Categories";
import NetWorth from "@/pages/NetWorth";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

// Vite's BASE_URL is "/finance/" in dev/prod and "/" under vitest. React
// Router's basename wants no trailing slash and an empty string for root.
const ROUTER_BASENAME = (import.meta.env?.BASE_URL ?? "/").replace(/\/+$/, "");

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={ROUTER_BASENAME}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/forecast" element={<Forecast />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/coast-fire" element={<CoastFire />} />
            <Route path="/mortgage" element={<Mortgage />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/net-worth" element={<NetWorth />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
