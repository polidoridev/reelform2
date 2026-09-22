"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
};

export default function AppSelect({ label, value, onValueChange, disabled, options }: Props) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        // Dynamic model options can reset the hidden native select to an empty
        // value. Only forward an actual choice, preserving the selected quality.
        if (next && options.some((option) => option.value === next)) onValueChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label} className="reelform-select-trigger">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start" sideOffset={5} className="reelform-select-menu">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="reelform-select-option">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
