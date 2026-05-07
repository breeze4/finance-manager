import { useLocation } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const dateRanges = [
  "This Month",
  "Last 30 Days",
  "This Year",
  "Last Year",
  "All Time",
];

const accountOptions = ["All Accounts", "Chase CC 7397", "BECU Checking"];

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  const location = useLocation();
  const isCalculatorRoute =
    location.pathname.startsWith("/coast-fire") ||
    location.pathname.startsWith("/mortgage");

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-4 lg:px-6 shrink-0">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </div>
      {!isCalculatorRoute && (
        <div className="flex items-center gap-3">
          <Select defaultValue="This Month">
            <SelectTrigger className="w-[150px] h-8 text-xs bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dateRanges.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select defaultValue="All Accounts">
            <SelectTrigger className="w-[160px] h-8 text-xs bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accountOptions.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </header>
  );
}
