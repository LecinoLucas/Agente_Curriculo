export type NotificationType = "info" | "warning" | "error" | "success";
export type NotificationCategory = "health" | "queue" | "ai" | "calendar" | "candidate" | "system";

export interface Notification {
  id: string;
  title: string;
  description: string;
  type: NotificationType;
  category: NotificationCategory;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
}
