"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { Button } from "@repo/ui/components/button";

interface FAQItem {
  q: string;
  a: string;
}

export default function FAQAccordion({ items }: { items: FAQItem[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div
          key={i}
          className={`overflow-hidden rounded-2xl border transition-colors duration-200 ${
            open === i
              ? "border-primary/30 bg-card shadow-[0_4px_20px_var(--shadow-warm)]"
              : "border-border bg-card hover:border-primary/20"
          }`}
        >
          <Button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-start gap-4 p-5 text-left"
          >
            <span className="font-display mt-0.5 flex-1 text-base font-600 leading-snug text-foreground sm:text-lg">
              {item.q}
            </span>
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                open === i
                  ? "bg-primary text-primary-foreground rotate-0"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {open === i ? (
                <Minus className="h-3.5 w-3.5" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
            </span>
          </Button>

          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="border-t border-border px-5 pb-5 pt-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}