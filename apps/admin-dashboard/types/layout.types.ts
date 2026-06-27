import { type ReactNode } from "react"

export interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  breadcrumb?: ReactNode
  icon?: React.ElementType
  className?: string
  divider?: boolean
}