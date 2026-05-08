import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAccounts } from "@/api/accounts";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";

const dateRanges = [
  "This Month",
  "Last 30 Days",
  "This Year",
  "Last Year",
  "All Time",
];

const ALL_ACCOUNTS = "__all__";

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  const location = useLocation();
  const isCalculatorRoute =
    location.pathname.startsWith("/coast-fire") ||
    location.pathname.startsWith("/mortgage");

  const { accountId, setAccountId } = useGlobalFilters();
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
  });
  const accounts = accountsQ.data ?? [];

  const selectValue = accountId == null ? ALL_ACCOUNTS : String(accountId);

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
          <Select
            value={selectValue}
            onValueChange={(v) =>
              setAccountId(v === ALL_ACCOUNTS ? null : Number(v))
            }
          >
            <SelectTrigger className="w-[160px] h-8 text-xs bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACCOUNTS}>All Accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </header>
  );
}
