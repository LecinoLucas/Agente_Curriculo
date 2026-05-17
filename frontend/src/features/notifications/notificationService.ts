import { httpRequest } from "../../services/http";
import { Notification } from "./types";

export type BackendNotification = Omit<Notification, "read" | "timestamp"> & {
  timestamp?: string;
};

export const notificationService = {
  async getNotifications(): Promise<BackendNotification[]> {
    try {
      return await httpRequest<BackendNotification[]>("/api/v1/admin/notifications");
    } catch (error) {
      console.error("[notificationService] Failed to fetch notifications", error);
      return [];
    }
  },
};
