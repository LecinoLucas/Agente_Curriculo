import { httpRequest } from "../../services/http";
import { Notification } from "./types";

export type BackendNotification = Omit<Notification, "read" | "timestamp"> & {
  timestamp?: string;
};

export const notificationService = {
  async getNotifications(): Promise<BackendNotification[]> {
    return await httpRequest<BackendNotification[]>("/api/v1/admin/notifications");
  },
};
