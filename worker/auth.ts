export interface AuthUser {
  userId: string;
  email: string;
  displayName: string;
  isLocalDev: boolean;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function getAuthenticatedUser(request: Request): AuthUser | null {
  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");

  if (userId && email) {
    const encodedName = request.headers.get("oai-authenticated-user-full-name");
    const encoding = request.headers.get(
      "oai-authenticated-user-full-name-encoding",
    );
    const fullName =
      encodedName && encoding === "percent-encoded-utf-8"
        ? safeDecode(encodedName)
        : null;

    return {
      userId,
      email,
      displayName: fullName ?? email,
      isLocalDev: false,
    };
  }

  if (LOCAL_HOSTS.has(new URL(request.url).hostname)) {
    return {
      userId: "local-captain",
      email: "captain@shipwright.local",
      displayName: "Local Captain",
      isLocalDev: true,
    };
  }

  return null;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
