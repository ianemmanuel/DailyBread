import type { Metadata } from "next"




export const metadata: Metadata = { title: "Identity & Access" }
export const revalidate = 60

export default async function NotificationsPage() {
    return (
        <p> notifications</p>
    )  
}