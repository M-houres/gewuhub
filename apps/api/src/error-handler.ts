/** 统一错误响应 */
export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number = 400) {
    super(message);
  }
}

export function errorResponse(error: any) {
  if (error instanceof ApiError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }
  return { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } };
}
