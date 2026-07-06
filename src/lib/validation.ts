import { z } from "zod";

export const depositStatuses = [
  "Đang gửi",
  "Đã nhận lại",
  "Đã đổi quà",
  "Đã hủy",
] as const;

export const cardActions = ["Gửi thẻ", "Lấy thẻ"] as const;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày gửi phải theo định dạng YYYY-MM-DD.");

const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Giờ gửi phải theo định dạng HH:mm.");

const optionalDateSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  dateSchema.optional(),
);

const optionalTimeSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  timeSchema.optional(),
);

const nonNegativeIntegerSchema = z.coerce
  .number("Vui lòng nhập số hợp lệ.")
  .int("Chỉ nhận số nguyên.")
  .min(0, "Không được nhập số âm.")
  .max(999_999, "Số quá lớn.");

export function normalizePhone(phone: string) {
  return phone.trim().replace(/[\s().-]/g, "");
}

export const phoneSchema = z
  .string()
  .min(8, "Số điện thoại quá ngắn.")
  .transform(normalizePhone)
  .refine(
    (value) => /^(0\d{8,10}|\+84\d{8,10})$/.test(value),
    "Số điện thoại chưa đúng định dạng Việt Nam.",
  );

export const actorNameSchema = z
  .string()
  .trim()
  .min(2, "Vui lòng nhập tên nhân viên.")
  .max(80, "Tên nhân viên quá dài.");

export const depositCreateSchema = z.object({
  fullName: z.string().trim().min(2, "Vui lòng nhập họ tên khách."),
  phone: phoneSchema,
  actorName: actorNameSchema,
  cardAction: z.enum(cardActions).default(cardActions[0]),
  cards: nonNegativeIntegerSchema,
  balls: nonNegativeIntegerSchema,
}).strict();

export const depositAdminCreateSchema = depositCreateSchema.extend({
  depositDate: dateSchema,
  depositTime: timeSchema,
}).strict();

export const depositStaffUpdateSchema = z
  .object({
    actorName: actorNameSchema,
    cards: nonNegativeIntegerSchema.optional(),
    balls: nonNegativeIntegerSchema.optional(),
    status: z.enum(depositStatuses).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "actorName"), {
    message: "Không có dữ liệu cập nhật.",
  });

export const depositAdminUpdateSchema = z
  .object({
    fullName: z.string().trim().min(2).optional(),
    phone: phoneSchema.optional(),
    actorName: actorNameSchema,
    depositDate: optionalDateSchema,
    depositTime: optionalTimeSchema,
    cards: nonNegativeIntegerSchema.optional(),
    balls: nonNegativeIntegerSchema.optional(),
    status: z.enum(depositStatuses).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "actorName"), {
    message: "Không có dữ liệu cập nhật.",
  });
