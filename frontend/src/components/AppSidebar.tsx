import {
  LayoutDashboard,
  LineChart,
  Receipt,
  RefreshCw,
  PiggyBank,
  TrendingUp,
  CreditCard,
  Home,
  Wallet,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "Net Worth", url: "/net-worth", icon: LineChart },
  { title: "Transactions", url: "/transactions", icon: Receipt },
  { title: "Subscriptions", url: "/subscriptions", icon: RefreshCw },
  { title: "Budget", url: "/budget", icon: PiggyBank },
  { title: "Forecast", url: "/forecast", icon: TrendingUp },
  { title: "Payments", url: "/payments", icon: CreditCard },
  { title: "Coast FIRE", url: "/coast-fire", icon: TrendingUp },
  { title: "Mortgage", url: "/mortgage", icon: Home },
  { title: "Accounts", url: "/accounts", icon: Wallet },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <TrendingUp className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold text-foreground tracking-tight">
            Finance Analyzer
          </span>
        )}
      </div>
      <SidebarContent className="px-2 py-4">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive =
              item.url === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.url);
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.title}
                >
                  <NavLink
                    to={item.url}
                    end={item.url === "/"}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
