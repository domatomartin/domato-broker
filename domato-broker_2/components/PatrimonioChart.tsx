"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function PatrimonioChart({
  data,
}: {
  data: { fecha: string; valor: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gainFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1FAE6D" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#1FAE6D" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#E7E9EE" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="fecha"
          stroke="#6E7684"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#6E7684"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            background: "#FFFFFF",
            border: "1px solid #E7E9EE",
            borderRadius: 12,
            fontSize: 12,
            boxShadow: "0 8px 24px -12px rgba(20,23,28,0.18)",
          }}
          labelStyle={{ color: "#171A21" }}
        />
        <Area
          type="monotone"
          dataKey="valor"
          stroke="#1FAE6D"
          strokeWidth={2.5}
          fill="url(#gainFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
