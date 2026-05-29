'use client';

import { useEffect, useState } from 'react';
import { Gift, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import {
  useLoyaltyPrograms,
  useCreateLoyaltyProgram,
  useUpdateLoyaltyProgram,
  type LoyaltyProgram,
} from '@/hooks/useLoyalty';
import { Toggle, inputClass, labelClass } from './shared';

interface TierRow {
  name: string;
  min_points: number;
}

function tiersFromRecord(record?: Record<string, number>): TierRow[] {
  if (!record) return [];
  return Object.entries(record).map(([name, min_points]) => ({ name, min_points }));
}

function tiersToRecord(rows: TierRow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, r) => {
    if (r.name.trim()) acc[r.name.trim()] = r.min_points;
    return acc;
  }, {});
}

export function LoyaltySettingsTab() {
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE);

  const { data: programs, isLoading } = useLoyaltyPrograms();
  const program: LoyaltyProgram | undefined = programs?.[0];

  const createProgram = useCreateLoyaltyProgram();
  const updateProgram = useUpdateLoyaltyProgram(program?.id ?? '');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [earnRate, setEarnRate] = useState('0.01');
  const [redeemRate, setRedeemRate] = useState('0.01');
  const [minRedeemPoints, setMinRedeemPoints] = useState('100');
  const [isActive, setIsActive] = useState(true);
  const [tiers, setTiers] = useState<TierRow[]>([]);

  useEffect(() => {
    if (program) {
      setName(program.name);
      setDescription(program.description ?? '');
      setEarnRate(String(program.earn_rate));
      setRedeemRate(String(program.redeem_rate));
      setMinRedeemPoints(String(program.min_redeem_points));
      setIsActive(program.is_active);
      setTiers(tiersFromRecord(program.tier_thresholds));
    }
  }, [program]);

  const handleSave = () => {
    const payload = {
      name: name.trim() || 'Rewards Program',
      description: description.trim() || undefined,
      earn_rate: parseFloat(earnRate) || 0.01,
      redeem_rate: parseFloat(redeemRate) || 0.01,
      min_redeem_points: parseInt(minRedeemPoints) || 100,
      is_active: isActive,
      tier_thresholds: tiersToRecord(tiers),
    };

    const action = program
      ? updateProgram.mutateAsync(payload)
      : createProgram.mutateAsync({ ...payload, is_active: isActive });

    action
      .then(() => toast.success('Loyalty program saved'))
      .catch(() => toast.error('Failed to save loyalty program'));
  };

  const addTier = () =>
    setTiers((prev) => [...prev, { name: '', min_points: 0 }]);

  const removeTier = (i: number) =>
    setTiers((prev) => prev.filter((_, idx) => idx !== i));

  const updateTier = (i: number, field: keyof TierRow, value: string) =>
    setTiers((prev) =>
      prev.map((row, idx) =>
        idx === i
          ? { ...row, [field]: field === 'min_points' ? parseInt(value) || 0 : value }
          : row,
      ),
    );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isSaving = createProgram.isPending || updateProgram.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Loyalty Program</span>
            {!program && (
              <span className="text-xs text-muted-foreground ml-2">(no program yet — save to create one)</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Program Name</label>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canEdit}
                placeholder="Rewards Program"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Description</label>
              <input
                className={inputClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
                placeholder="e.g. Earn 1 pt per KSh 100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Earn Rate (pts / KSh)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                className={inputClass}
                value={earnRate}
                onChange={(e) => setEarnRate(e.target.value)}
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground">
                0.01 = 1 pt per KSh 100
              </p>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Redeem Rate (KSh / pt)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                className={inputClass}
                value={redeemRate}
                onChange={(e) => setRedeemRate(e.target.value)}
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground">
                0.01 = 100 pts = KSh 1
              </p>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Min Redeem Points</label>
              <input
                type="number"
                min="1"
                className={inputClass}
                value={minRedeemPoints}
                onChange={(e) => setMinRedeemPoints(e.target.value)}
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground">
                Minimum pts required to redeem
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <p className="text-sm font-semibold">Program Active</p>
              <p className="text-xs text-muted-foreground">
                Inactive programs do not earn points at checkout
              </p>
            </div>
            <Toggle checked={isActive} onChange={setIsActive} disabled={!canEdit} />
          </div>
        </CardContent>
      </Card>

      {/* Tier thresholds */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">Loyalty Tiers</span>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={addTier}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Tier
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {tiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tiers configured. Add tiers to unlock member benefits at point thresholds.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider px-1 mb-1">
                <span>Tier Name</span>
                <span>Min Points</span>
                <span />
              </div>
              {tiers.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input
                    className={inputClass}
                    value={row.name}
                    onChange={(e) => updateTier(i, 'name', e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. Silver"
                  />
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={row.min_points}
                    onChange={(e) => updateTier(i, 'min_points', e.target.value)}
                    disabled={!canEdit}
                  />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeTier(i)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Loyalty Program
          </Button>
        </div>
      )}
    </div>
  );
}
