"use client";

import { useForm } from "react-hook-form";
import { motion } from "framer-motion";
import { ArrowLeft, Package, Loader2, Shuffle } from "lucide-react";
import Link from "next/link";
import { useCreateShipment } from "@/lib/hooks/useShipments";
import { generateTrackingNumber, cn } from "@/lib/utils";
import { CarrierType } from "@/types";

const CARRIERS: { value: CarrierType; label: string; color: string }[] = [
  { value: "amazon",    label: "Amazon",     color: "#FF9900" },
  { value: "flipkart",  label: "Flipkart",   color: "#2874F0" },
  { value: "myntra",    label: "Myntra",     color: "#FF3F6C" },
  { value: "dhl",       label: "DHL",        color: "#FFCC00" },
  { value: "fedex",     label: "FedEx",      color: "#4D148C" },
  { value: "delhivery", label: "Delhivery",  color: "#D42B2B" },
  { value: "bluedart",  label: "Blue Dart",  color: "#003087" },
  { value: "custom",    label: "Custom",     color: "#6B7280" },
];

const SERVICE_TYPES = ["standard", "express", "overnight", "economy", "priority"];

interface FormData {
  tracking_number: string;
  carrier: CarrierType;
  description: string;
  weight_kg: number | "";
  service_type: string;
}

export default function NewShipmentPage() {
  const { mutate: createShipment, isPending } = useCreateShipment();
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: { carrier: "amazon", service_type: "standard" },
  });

  const carrier = watch("carrier");

  const onSubmit = (data: FormData) => {
    createShipment({
      ...data,
      weight_kg: data.weight_kg === "" ? undefined : Number(data.weight_kg),
    });
  };

  return (
    <div className="max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/shipments" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Shipments
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold font-display">Add Shipment</h1>
          <p className="text-sm text-muted-foreground mt-1">Track a new package by entering its details below</p>
        </div>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        onSubmit={handleSubmit(onSubmit)}
        className="card-premium p-6 space-y-6"
      >
        {/* Carrier selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground/80">Carrier</label>
          <div className="grid grid-cols-4 gap-2">
            {CARRIERS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setValue("carrier", c.value)}
                className={cn(
                  "py-2.5 px-3 rounded-lg border text-xs font-medium transition-all duration-150",
                  carrier === c.value
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-white/8 bg-white/3 text-muted-foreground hover:border-white/15 hover:text-foreground"
                )}
                style={carrier === c.value ? { borderColor: c.color + "60", backgroundColor: c.color + "15", color: c.color } : {}}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tracking number */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/80">Tracking Number</label>
          <div className="flex gap-2">
            <input
              {...register("tracking_number", {
                required: "Tracking number is required",
                minLength: { value: 5, message: "Too short" },
              })}
              placeholder="e.g. AZ1234567890"
              className={cn("input-field flex-1 font-mono uppercase", errors.tracking_number && "border-destructive/50")}
            />
            <button
              type="button"
              onClick={() => setValue("tracking_number", generateTrackingNumber(carrier as CarrierType))}
              className="btn-ghost border border-white/8 px-3 h-auto"
              title="Generate sample tracking number"
            >
              <Shuffle className="w-4 h-4" />
            </button>
          </div>
          {errors.tracking_number && <p className="text-xs text-destructive">{errors.tracking_number.message}</p>}
        </div>

        {/* Service type + weight row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground/80">Service Type</label>
            <select {...register("service_type")} className="input-field cursor-pointer capitalize">
              {SERVICE_TYPES.map((s) => (
                <option key={s} value={s} className="capitalize">{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground/80">
              Weight <span className="text-muted-foreground font-normal">(kg, optional)</span>
            </label>
            <input
              {...register("weight_kg", {
                min: { value: 0.01, message: "Must be positive" },
                max: { value: 999, message: "Too heavy" },
              })}
              type="number"
              step="0.1"
              placeholder="e.g. 1.5"
              className={cn("input-field", errors.weight_kg && "border-destructive/50")}
            />
            {errors.weight_kg && <p className="text-xs text-destructive">{errors.weight_kg.message}</p>}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/80">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            {...register("description")}
            rows={3}
            placeholder="e.g. Electronics order — laptop bag"
            className="input-field resize-none"
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={isPending} className="btn-primary flex-1 h-11">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Package className="w-4 h-4" /> Add Shipment</>}
          </button>
          <Link href="/shipments" className="btn-ghost border border-white/8 h-11 px-5">
            Cancel
          </Link>
        </div>
      </motion.form>
    </div>
  );
}
