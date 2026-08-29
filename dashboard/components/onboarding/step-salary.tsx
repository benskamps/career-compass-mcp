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
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      await saveSalaryPrefs({ salaryMin: min || undefined, salaryMax: max || undefined, salaryCurrency: currency, openToRemote: remote, openToRelocation: relocation, noticePeriod: notice || undefined });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Failed to save. Please try again.");
    }
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
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={remote} onChange={(e) => { const val = e.target.checked; setRemote(val); setError(null); saveSalaryPrefs({ salaryMin: min || undefined, salaryMax: max || undefined, salaryCurrency: currency, openToRemote: val, openToRelocation: relocation, noticePeriod: notice || undefined }).catch((err) => setError(err instanceof Error && err.message ? err.message : "Failed to save. Please try again.")); }} className="accent-accent" /><span>Open to remote work</span></label>
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={relocation} onChange={(e) => { const val = e.target.checked; setRelocation(val); setError(null); saveSalaryPrefs({ salaryMin: min || undefined, salaryMax: max || undefined, salaryCurrency: currency, openToRemote: remote, openToRelocation: val, noticePeriod: notice || undefined }).catch((err) => setError(err instanceof Error && err.message ? err.message : "Failed to save. Please try again.")); }} className="accent-accent" /><span>Open to relocation</span></label>
        </div>
        <div className="space-y-2"><Label>Notice period</Label><Input value={notice} onChange={(e) => setNotice(e.target.value)} onBlur={save} placeholder="2 weeks" /></div>
        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </CardContent>
    </Card>
  );
}
