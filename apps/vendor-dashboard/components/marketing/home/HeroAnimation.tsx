"use client";

import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { TrendingUp, Clock3, ChefHat, Users } from "lucide-react";

// Fix: type ease as a tuple, not a plain number[]
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.12 + 0.3,
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

const revenueData = [38, 52, 45, 68, 74, 62, 90];

export default function HeroAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.75, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-sm lg:max-w-none"
    >
      {/* Shadow card behind */}
      <div className="absolute inset-3 rotate-2 rounded-3xl bg-primary/15 blur-sm" />

      {/* Main dashboard card */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-[0_24px_64px_var(--shadow-warm)]">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <ChefHat className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Mama Wanjiku's Kitchen</p>
              <p className="text-[10px] text-muted-foreground">Vendor Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] font-semibold text-green-700">Live</span>
          </div>
        </div>

        <div className="p-5">
          {/* Revenue block */}
          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mb-4 overflow-hidden rounded-2xl bg-deep p-5"
          >
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-deep-foreground/50">
              This Month
            </p>
            <p className="font-display text-3xl font-700 text-deep-foreground">
              KSh 84,200
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5">
                <TrendingUp className="h-3 w-3 text-green-400" />
                <span className="text-[11px] font-semibold text-green-400">+24%</span>
              </div>
              <span className="text-[11px] text-deep-foreground/40">vs last month</span>
            </div>

            {/* Mini bar chart */}
            <div className="mt-4 flex items-end gap-1">
              {revenueData.map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.5 + i * 0.07, duration: 0.4, ease: "easeOut" }}
                  style={{ height: `${h * 0.6}px`, transformOrigin: "bottom" }}
                  className={`flex-1 rounded-sm ${
                    i === revenueData.length - 1 ? "bg-primary" : "bg-deep-foreground/15"
                  }`}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <span key={d} className="flex-1 text-center text-[9px] text-deep-foreground/30">
                  {d}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Stats row */}
          <motion.div
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mb-4 grid grid-cols-2 gap-3"
          >
            <div className="rounded-xl bg-secondary p-3.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                On-Demand
              </p>
              <p className="font-display text-2xl font-700 text-foreground">142</p>
              <p className="text-[11px] text-muted-foreground">orders this week</p>
            </div>
            <div className="rounded-xl border border-accent/30 bg-accent/20 p-3.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Meal Plans
              </p>
              <p className="font-display text-2xl font-700 text-foreground">38</p>
              <p className="text-[11px] text-muted-foreground">subscribers</p>
            </div>
          </motion.div>

          {/* Upcoming delivery */}
          <motion.div
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/20">
              <Clock3 className="h-4 w-4 text-accent-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">Next batch delivery</p>
              <p className="text-[11px] text-muted-foreground">Today 1:00 PM — 12 orders ready</p>
            </div>
            <div className="rounded-lg bg-primary/10 px-2 py-1">
              <span className="text-[10px] font-bold text-primary">SOON</span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Floating chip 1 */}
      <motion.div
        initial={{ opacity: 0, y: 12, x: -12 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        style={{ animation: "float 5s ease-in-out infinite", animationDelay: "0s" }}
        className="absolute -left-6 top-1/4 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-[0_8px_24px_var(--shadow-warm)]"
      >
        <Users className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">+3 new subscribers</span>
      </motion.div>

      {/* Floating chip 2 */}
      <motion.div
        initial={{ opacity: 0, y: -12, x: 12 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ delay: 1.05, duration: 0.5 }}
        style={{ animation: "float 6s ease-in-out infinite", animationDelay: "1.5s" }}
        className="absolute -right-4 bottom-1/4 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-[0_8px_24px_var(--shadow-warm)]"
      >
        <span className="text-sm">🍽️</span>
        <span className="text-xs font-semibold text-foreground">Order #1,042 placed</span>
      </motion.div>
    </motion.div>
  );
}