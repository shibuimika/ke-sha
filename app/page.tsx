"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { ROLE_WEIGHT, ageAdjustment, baseWeight, formatYen, ParticipantInput, computeShares, Granularity } from "@/lib/calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export default function Page() {
  const {
    participants,
    total,
    granularity,
    // mode はUIから削除済み
    setTotal,
    setGranularity,
    setMode,
    addParticipant,
    removeParticipant,
    updateParticipant,
    getComputed,
  } = useAppStore();

  // 合計金額入力: 手入力時に一時的な空文字を許可
  const [totalInput, setTotalInput] = useState<string>(String(total));
  useEffect(() => {
    setTotalInput(String(total));
  }, [total]);

  const computed = getComputed();
  const sumOK = computed.sumRounded >= Math.round(total);
  const sumBadge = sumOK ? (
    <span className="text-xs rounded-full bg-green-100 text-green-700 px-2 py-1">合計チェック：OK</span>
  ) : (
    <span className="text-xs rounded-full bg-red-100 text-red-700 px-2 py-1">合計チェック：NG</span>
  );

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">傾斜割り勘（MVP）</h1>
        {sumBadge}
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-end">
        <div className="space-y-2">
          <Label htmlFor="total">合計金額（円）</Label>
          <Input
            id="total"
            type="text"
            inputMode="numeric"
            value={totalInput}
            placeholder="0"
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, "");
              setTotalInput(v);
              if (v !== "") {
                const n = Number(v);
                if (!Number.isNaN(n)) setTotal(n);
              }
            }}
            onBlur={() => {
              if (totalInput === "") setTotalInput(String(total));
            }}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">参加者</h2>
          <Button onClick={addParticipant}>行を追加</Button>
        </div>

        <div className="hidden md:grid grid-cols-[120px_1fr_120px_84px_1fr_90px_44px] gap-2 items-center text-xs">
          <div className="text-muted-foreground">金額</div>
          <div className="text-muted-foreground">名前</div>
          <div className="text-muted-foreground">役職</div>
          <div className="text-muted-foreground">年齢</div>
          <div className="text-muted-foreground">ウェイト</div>
          <div className="text-muted-foreground">コピー</div>
          <div className="text-muted-foreground text-right pr-2">操作</div>
        </div>

        <div className="space-y-2">
          {participants.map((p) => {
            const w = computed.weightsById[p.id] ?? 0;
            const amount = computed.amountsById[p.id] ?? 0;

            return (
              <Row
                key={p.id}
                data={p}
                weight={w}
                amount={amount}
                onChange={(updates) => updateParticipant(p.id, updates)}
                onRemove={() => removeParticipant(p.id)}
              />
            );
          })}
        </div>
      </section>

      <FooterControls
        total={total}
        computedSum={computed.sumRounded}
        participants={participants}
        granularity={granularity}
        onApply={(g, chosenMode) => {
          setGranularity(g);
          setMode(chosenMode);
        }}
      />
    </div>
  );
}

function FooterControls({
  total,
  computedSum,
  participants,
  granularity,
  onApply,
}: {
  total: number;
  computedSum: number;
  participants: ParticipantInput[];
  granularity: Granularity;
  onApply: (g: Granularity, m: "floor" | "nearest" | "ceil") => void;
}) {
  const [g, setG] = useState<string>(String(granularity));
  useEffect(() => setG(String(granularity)), [granularity]);

  return (
    <footer className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-t pt-4">
      <div className="text-sm text-muted-foreground">
        合計: {formatYen(computedSum)} / 目標: {formatYen(total)}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap">単位</Label>
          <Select value={g} onValueChange={(v) => setG(v)}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 10, 50, 100].map((x) => (
                <SelectItem key={x} value={String(x)}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            const gNum = Number(g) as Granularity;
            const modes: ("floor" | "nearest" | "ceil")[] = [
              "floor",
              "nearest",
              "ceil",
            ];
            const results = modes.map((m) => ({
              m,
              r: computeShares(participants, total, gNum, m),
            }));
            const best = results
              .map((x) => ({
                m: x.m,
                overshoot: Math.max(0, Math.round(x.r.sumRounded - total)),
              }))
              .sort((a, b) => a.overshoot - b.overshoot)[0];
            onApply(gNum, best.m);
            toast(`キリのいい数字に自動調整（単位:${g} / ${best.m}）`);
          }}
        >
          キリのいい数字にする
        </Button>
      </div>
    </footer>
  );
}

function Row({
  data,
  weight,
  amount,
  onChange,
  onRemove,
}: {
  data: {
    id: string;
    name: string;
    role: keyof typeof ROLE_WEIGHT;
    age: number;
    treat?: boolean;
    customWeight?: number;
  };
  weight: number;
  amount: number;
  onChange: (u: Partial<Omit<ParticipantInput, "id">>) => void;
  onRemove: () => void;
}) {
  const [active, setActive] = useState(false);

  const displayWeight = Number(weight.toFixed(2));
  const roleOptions: { value: keyof typeof ROLE_WEIGHT; label: string }[] = [
    { value: "intern", label: "インターン" },
    { value: "junior", label: "若手" },
    { value: "mid", label: "中堅" },
    { value: "manager", label: "課長" },
    { value: "director", label: "部長" },
    { value: "exec", label: "役員" },
  ];

  return (
    <div
      className={`grid grid-rows-[auto_auto_auto_auto] md:grid-cols-[120px_1fr_120px_84px_1fr_90px_44px] gap-2 items-center rounded-lg p-3 transition-colors border ${
        active ? "bg-secondary/40" : "bg-card"
      } shadow-sm`}
    >
      <div className="row-start-4 md:row-auto md:col-start-1 font-semibold text-base md:text-sm">
        {formatYen(amount)}
      </div>

      <Input
        className="md:col-start-2"
        value={data.name}
        placeholder="名前"
        onChange={(e) => onChange({ name: e.target.value })}
      />

      <Select
        value={data.role}
        onValueChange={(v: keyof typeof ROLE_WEIGHT) => onChange({ role: v })}
      >
        <SelectTrigger className="md:col-start-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roleOptions.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        className="md:col-start-4"
        type="number"
        inputMode="numeric"
        value={data.age}
        onChange={(e) => onChange({ age: Number(e.target.value || 0) })}
      />

      <div className="space-y-1 md:order-none row-start-3 md:col-start-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground gap-3">
          <div>
            役職基準 {baseWeight(data.role, data.age).toFixed(2)} / 年齢補正 {ageAdjustment(data.age) >= 0 ? "+" : ""}
            {ageAdjustment(data.age).toFixed(1)}
          </div>
          <div className="flex items-center gap-3">
            <div>現在: {displayWeight.toFixed(2)}</div>
            <div className="flex items-center gap-1">
              <Switch
                checked={Boolean(data.treat)}
                onCheckedChange={(v) => onChange({ treat: v })}
                aria-label="おごり（この人は0円）"
              />
              <span>おごり</span>
            </div>
          </div>
        </div>
        <Slider
          value={[Number(data.customWeight ?? displayWeight)]}
          min={0.1}
          max={2}
          step={0.1}
          onValueChange={(v) => {
            setActive(true);
            onChange({ customWeight: v[0] });
          }}
          onValueCommit={() => setActive(false)}
        />
      </div>

      <div className="flex items-center justify-between md:justify-start gap-3 row-start-4 md:col-start-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>コピー</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              navigator.clipboard.writeText(String(amount));
              toast("コピーしました");
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-end md:col-start-7">
        <Button variant="ghost" size="icon" aria-label="行を削除" onClick={onRemove}>
          ×
        </Button>
      </div>
    </div>
  );
}

