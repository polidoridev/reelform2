export const MIN_VIDEO_SECONDS = 4;
export const MAX_VIDEO_SECONDS = 30;
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const MAX_VIDEO_SIZE_LABEL = "1 GB";

export const VIDEO_FORMAT_LABEL = "MP4, MOV, M4V, or WebM";
export const VIDEO_ACCEPT = ".mp4,.mov,.m4v,.webm,video/mp4,video/quicktime,video/x-m4v,video/webm";
export function videoContentType(file: { name: string; type: string }): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", m4v: "video/mp4", webm: "video/webm" };
  if (extension && types[extension]) return types[extension];
  return ({ "video/mp4": "video/mp4", "video/quicktime": "video/quicktime", "video/x-m4v": "video/mp4", "video/webm": "video/webm" } as Record<string, string>)[file.type] || null;
}
