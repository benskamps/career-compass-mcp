"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { saveTargets } from "@/app/onboarding/actions";

const COMMON_ROLES = ["Software Engineer", "Product Manager", "Program Manager", "Data Scientist", "Engineering Manager", "Designer", "DevOps Engineer", "Chief of Staff", "Director of Operations", "Head of Customer Success", "Solutions Architect"];
const COMMON_INDUSTRIES = ["SaaS", "Healthcare", "Fintech", "E-commerce", "Logistics", "Education", "AI/ML", "Cybersecurity", "Media", "Enterprise"];
const COMPANY_SIZES = ["Seed/Pre-seed", "Series A", "Series B", "Series C+", "Mid-market (200-2000)", "Enterprise (2000+)", "Public"];

interface StepTargetsProps { currentRoles: string[]; currentIndustries: string[]; currentSizes: string[]; }

export function StepTargets({ currentRoles, currentIndustries, currentSizes }: StepTargetsProps) {
  const [roles, setRoles] = useState<string[]>(currentRoles);
  const [industries, setIndustries] = useState<string[]>(currentIndustries);
  const [sizes, setSizes] = useState<string[]>(currentSizes);
  const [customRole, setCustomRole] = useState("");

  const addCustomRole = () => {
    if (customRole.trim() && !roles.includes(customRole.trim())) {
      const next = [...roles, customRole.trim()];
      setRoles(next);
      setCustomRole("");
      saveTargets({ targetRoles: next, targetIndustries: industries, targetCompanySize: sizes });
    }
  };

  const save = async (r: string[], i: string[], s: string[]) => {
    await saveTargets({ targetRoles: r, targetIndustries: i, targetCompanySize: s });
  };

  const toggleRole = (role: string) => { const next = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]; setRoles(next); save(next, industries, sizes); };
  const toggleIndustry = (ind: string) => { const next = industries.includes(ind) ? industries.filter((i) => i !== ind) : [...industries, ind]; setIndustries(next); save(roles, next, sizes); };
  const toggleSize = (size: string) => { const next = sizes.includes(size) ? sizes.filter((s) => s !== size) : [...sizes, size]; setSizes(next); save(roles, industries, next); };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Target Roles</h3>
          <div className="flex flex-wrap gap-2">
            {COMMON_ROLES.map((role) => (<Badge key={role} variant={roles.includes(role) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleRole(role)}>{role}</Badge>))}
          </div>
          <div className="flex gap-2">
            <Input value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="Add custom role..." onKeyDown={(e) => e.key === "Enter" && addCustomRole()} className="max-w-xs" />
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Target Industries</h3>
          <div className="flex flex-wrap gap-2">
            {COMMON_INDUSTRIES.map((ind) => (<Badge key={ind} variant={industries.includes(ind) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleIndustry(ind)}>{ind}</Badge>))}
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Company Size</h3>
          <div className="flex flex-wrap gap-2">
            {COMPANY_SIZES.map((size) => (<Badge key={size} variant={sizes.includes(size) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleSize(size)}>{size}</Badge>))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
