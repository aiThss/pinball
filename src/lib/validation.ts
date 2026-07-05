import { z } from "zod";

export const depositStatuses = [
  "Đang gửi",
  "Đã nhận lại",
  "Đã đổi quà",
  "Đã hủy",
] as const;

export const userRoles = ["admin", "staff"] as const;

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

export const loginSchema = z.object({
  username: z.string().trim().min(2, "Vui lòng nhập tài khoản."),
  password: z.string().min(1, "Vui lòng nhập mật khẩu."),
});

export const depositCreateSchema = z.object({
  fullName: z.string().trim().min(2, "Vui lòng nhập họ tên khách."),
  phone: phoneSchema,
  depositDate: optionalDateSchema,
  depositTime: optionalTimeSchema,
  cards: nonNegativeIntegerSchema,
  balls: nonNegativeIntegerSchema,
  status: z.enum(depositStatuses).optional(),
});

export const depositUpdateSchema = z
  .object({
    fullName: z.string().trim().min(2).optional(),
    phone: phoneSchema.optional(),
    depositDate: optionalDateSchema,
    depositTime: optionalTimeSchema,
    cards: nonNegativeIntegerSchema.optional(),
    balls: nonNegativeIntegerSchema.optional(),
    status: z.enum(depositStatuses).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Không có dữ liệu cập nhật.",
  });

export const userCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Tài khoản tối thiểu 3 ký tự.")
    .max(40, "Tài khoản quá dài.")
    .regex(/^[a-zA-Z0-9._-]+$/, "Chỉ dùng chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.")
    .transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(2, "Vui lòng nhập tên nhân viên."),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự."),
  role: z.enum(userRoles),
});

export const userUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).optional(),
    password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự.").optional(),
    role: z.enum(userRoles).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Không có dữ liệu cập nhật.",
  });
