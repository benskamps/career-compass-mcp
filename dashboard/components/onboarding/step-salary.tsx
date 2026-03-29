"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSalaryPrefs } from "@/app/onboarding/actions";

interface StepSalaryProps { currentMin?: number; currentMax?: number; currentCurrency: string; currentRemote: boolean; currentRelocation: boolean; currentNotice?: string; }

export function StepSalary({ currentMin, currentMax, currentCurrency, currentRemote, currentRelocation, currentNotice }: StepSalaryProps) {
  const [min, setMin] = useState(currentMin ?? 0);
  const [max, setMax] = useState(currentMax ?? 0);
  const [currency] = useState(currentCurrency);
  const [remote, setRemote] = useState(currentRemote);
  const [relocation, setRelocation] = useState(currentRelocation);
  const [notice, setNotice] = useState(currentNotice ?? "");

  const save = () => {
    saveSalaryPrefs({ salaryMin: min || undefined, salaryMax: max || undefined, salaryCurrency: currency, openToRemote: remote, openToRelocation: relocation, noticePeriod: notice || undefined });
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <h2 className="text-xl font-semibold">Salary & Preferences</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Minimum ({currency})</Label><Input type="number" value={min || ""} onChange={(e) => setMin(Number(e.target.value))} onBlur={save} placeholder="140000" /></div>
          <div className="space-y-2"><Label>Maximum ({currency})</Label><Input type="number" value={max || ""} onChange={(e) => setMax(Number(e.target.value))} onBlur={save} placeholder="180000" /></div>
        </div>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={remote} onChange={(e) => { setRemote(e.target.checked); save(); }} className="accent-accent" /><span>Open to remote work</span></label>
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={relocation} onChange={(e) => { setRelocation(e.target.checked); save(); }} className="accent-accent" /><span>Open to relocation</span></label>
        </div>
        <div className="space-y-2"><Label>Notice period</Label><Input value={notice} onChange={(e) => setNotice(e.target.value)} onBlur={save} placeholder="2 weeks" /></div>
      </CardContent>
    </Card>
  );
}
