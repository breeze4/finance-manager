import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { GlobalFiltersProvider } from "@/hooks/useGlobalFilters";

const titleMap: Record<string, string> = {
  "/": "Overview",
  "/transactions": "Transactions",
  "/subscriptions": "Subscriptions",
  "/budget": "Budget",
  "/forecast": "Forecast",
  "/payments": "Payments",
  "/coast-fire": "Coast FIRE",
  "/mortgage": "Mortgage",
};

export function Layout() {
  const location = useLocation();
  const title = titleMap[location.pathname] || "Finance Analyzer";

  return (
    <GlobalFiltersProvider>
      <SidebarProvider>
        <div className="flex h-screen w-full overflow-hidden">
          <AppSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopBar title={title} />
            <main className="flex-1 overflow-y-auto p-4 lg:p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </GlobalFiltersProvider>
  );
}
