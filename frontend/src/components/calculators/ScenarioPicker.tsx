import * as React from "react";
import { Check, ChevronDown, MoreHorizontal, Pencil, Plus, Copy, Trash2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Minimum scenario shape consumed by `ScenarioPicker`. Calculator-specific
 * scenarios (Coast FIRE / Mortgage) extend this with their own fields.
 */
export interface ScenarioBase {
  id: number;
  name: string;
  isActive: boolean;
}

export interface ScenarioPickerProps<T extends ScenarioBase> {
  scenarios: T[];
  activeId: number | null;
  /** When true, the trigger shows a dirty-state dot. */
  isDirty?: boolean;
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onDuplicate: (id: number) => void;
  onDelete: (id: number) => void;
  /** Optional className on the trigger button. */
  className?: string;
}

type DialogMode =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "rename"; scenario: ScenarioBase }
  | { kind: "delete"; scenario: ScenarioBase };

export function ScenarioPicker<T extends ScenarioBase>({
  scenarios,
  activeId,
  isDirty = false,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  className
}: ScenarioPickerProps<T>) {
  const [dialog, setDialog] = React.useState<DialogMode>({ kind: "none" });
  const [draftName, setDraftName] = React.useState("");

  const active = scenarios.find(s => s.id === activeId) ?? null;

  const openCreate = () => {
    setDraftName("");
    setDialog({ kind: "create" });
  };
  const openRename = (s: T) => {
    setDraftName(s.name);
    setDialog({ kind: "rename", scenario: s });
  };
  const openDelete = (s: T) => setDialog({ kind: "delete", scenario: s });
  const closeDialog = () => setDialog({ kind: "none" });

  const submitDialog = () => {
    if (dialog.kind === "create") {
      const name = draftName.trim();
      if (name) onCreate(name);
    } else if (dialog.kind === "rename") {
      const name = draftName.trim();
      if (name) onRename(dialog.scenario.id, name);
    } else if (dialog.kind === "delete") {
      onDelete(dialog.scenario.id);
    }
    closeDialog();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn("min-w-[200px] justify-between", className)}>
            <span className="flex items-center gap-2 truncate">
              {isDirty && (
                <Circle
                  aria-label="Unsaved changes"
                  className="h-2 w-2 fill-amber-500 stroke-amber-500"
                />
              )}
              <span className="truncate">{active ? active.name : "Select scenario"}</span>
            </span>
            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="min-w-[240px]">
          {scenarios.length === 0 && (
            <DropdownMenuItem disabled>No scenarios yet</DropdownMenuItem>
          )}

          {scenarios.map(s => (
            <ScenarioRow
              key={s.id}
              scenario={s}
              isActive={s.id === activeId}
              onSelect={() => onSelect(s.id)}
              onRename={() => openRename(s)}
              onDuplicate={() => onDuplicate(s.id)}
              onDelete={() => openDelete(s)}
            />
          ))}

          {scenarios.length > 0 && <DropdownMenuSeparator />}

          <DropdownMenuItem
            onSelect={(e: Event) => {
              e.preventDefault();
              openCreate();
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New scenario
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create / rename dialog */}
      <Dialog
        open={dialog.kind === "create" || dialog.kind === "rename"}
        onOpenChange={open => !open && closeDialog()}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialog.kind === "create" ? "New scenario" : "Rename scenario"}
            </DialogTitle>
            <DialogDescription>
              {dialog.kind === "create"
                ? "Give this scenario a name to save it."
                : "Choose a new name for this scenario."}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            placeholder="Scenario name"
            onKeyDown={e => {
              if (e.key === "Enter") submitDialog();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={submitDialog} disabled={!draftName.trim()}>
              {dialog.kind === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm-delete dialog */}
      <Dialog
        open={dialog.kind === "delete"}
        onOpenChange={open => !open && closeDialog()}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete scenario?</DialogTitle>
            <DialogDescription>
              {dialog.kind === "delete"
                ? `"${dialog.scenario.name}" will be removed permanently.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitDialog}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Internal: a single scenario row with main click + per-row actions menu      */
/* -------------------------------------------------------------------------- */

interface ScenarioRowProps {
  scenario: ScenarioBase;
  isActive: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function ScenarioRow({ scenario, isActive, onSelect, onRename, onDuplicate, onDelete }: ScenarioRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex flex-1 items-center gap-2 truncate rounded px-1 py-0.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none",
          isActive && "font-semibold"
        )}
      >
        {isActive ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
        <span className="truncate">{scenario.name}</span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Scenario actions for ${scenario.name}`}
            className="h-7 w-7"
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          <DropdownMenuItem
            onSelect={(e: Event) => {
              e.preventDefault();
              onRename();
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e: Event) => {
              e.preventDefault();
              onDuplicate();
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e: Event) => {
              e.preventDefault();
              onDelete();
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
