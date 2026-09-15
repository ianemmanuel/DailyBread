import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** The class merger every component in components/ui/ uses. App-local, as in
 *  the vendor and admin apps — @repo/ui carries the styling framework only. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
