import process from "node:process";
import { SignJWT } from "jose";
import { UserTable } from "#/database/user"; // UserTable 从这里导入

/**
 * 处理 GitHub OAuth 回调的事件处理程序。
 * @param event H3Event 事件对象
 * @returns Promise<any> 重定向响应或错误
 */
export default defineEventHandler(async (event) => {
  console.log(
    "[OAuth GitHub] Handler started. Request URL:",
    event.node.req.url
  );

  try {
    let userTable: UserTable;

    try {
      console.log("[OAuth GitHub] Attempting to instantiate UserTable...");
      // UserTable 类在其定义中直接导入和使用 supabase 客户端，
      // 因此构造函数不需要参数。
      userTable = new UserTable();
      console.log("[OAuth GitHub] UserTable instantiated successfully.");

      if (process.env.INIT_TABLE !== "false") {
        console.log(
          "[OAuth GitHub] Initializing table as INIT_TABLE is not 'false'..."
        );
        await userTable.init();
        console.log("[OAuth GitHub] Table initialization complete.");
      }
    } catch (e: any) {
      console.error(
        "[OAuth GitHub] CRITICAL: Error during UserTable instantiation or DB initialization:",
        e
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Server Error - DB Setup Failed",
        message: `DB setup error: ${
          e.message || "Unknown DB initialization failure."
        }`,
      });
    }

    const queryCode = getQuery(event).code;
    console.log(`[OAuth GitHub] Received OAuth code: ${queryCode}`);

    if (!queryCode) {
      console.error(
        "[OAuth GitHub] Error: No OAuth code found in query parameters."
      );
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        message: "OAuth code is missing.",
      });
    }

    if (!process.env.G_CLIENT_ID || !process.env.G_CLIENT_SECRET) {
      console.error(
        "[OAuth GitHub] Error: GitHub Client ID or Secret not configured in .env."
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Server Configuration Error",
        message: "GitHub OAuth credentials missing on server.",
      });
    }

    let accessTokenResponse: {
      access_token: string;
      token_type: string;
      scope: string;
      error?: string;
      error_description?: string;
    };
    try {
      console.log("[OAuth GitHub] Fetching access token from GitHub...");
      accessTokenResponse = await $fetch(
        `https://github.com/login/oauth/access_token`,
        {
          method: "POST",
          body: {
            client_id: process.env.G_CLIENT_ID,
            client_secret: process.env.G_CLIENT_SECRET,
            code: queryCode,
          },
          headers: {
            Accept: "application/json",
          },
        }
      );
      console.log("[OAuth GitHub] Access token response received from GitHub.");

      if (accessTokenResponse.error) {
        console.error(
          `[OAuth GitHub] GitHub OAuth Error (token exchange): ${accessTokenResponse.error} - ${accessTokenResponse.error_description}`
        );
        throw createError({
          statusCode: 400,
          statusMessage: "GitHub OAuth Error",
          message: `GitHub token exchange failed: ${
            accessTokenResponse.error_description || accessTokenResponse.error
          }`,
        });
      }
      if (!accessTokenResponse.access_token) {
        console.error(
          "[OAuth GitHub] Error: No access_token in GitHub response despite no error field.",
          accessTokenResponse
        );
        throw createError({
          statusCode: 500,
          statusMessage: "GitHub OAuth Failed",
          message:
            "Failed to retrieve access token from GitHub (no token in response).",
        });
      }
    } catch (e: any) {
      console.error(
        "[OAuth GitHub] Error fetching access token from GitHub:",
        e
      );
      const statusCode = e.statusCode || e.response?.status || 500;
      const statusMessage =
        e.statusMessage ||
        e.response?.statusText ||
        "Failed to fetch access token";
      const message =
        e.data?.message ||
        e.message ||
        "Unknown error during GitHub token fetch.";
      throw createError({ statusCode, statusMessage, message });
    }

    let userInfo: {
      id: number;
      name: string;
      avatar_url: string;
      email:
        | string
        | null /* notification_email is not standard, GitHub usually provides 'email' */;
    };
    try {
      console.log("[OAuth GitHub] Fetching user info from GitHub API...");
      userInfo = await $fetch(`https://api.github.com/user`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `token ${accessTokenResponse.access_token}`,
          "User-Agent": "NewsNow App", // Required by GitHub API
        },
      });
      console.log(
        "[OAuth GitHub] User info received from GitHub API (logging id and name):",
        { id: userInfo.id, name: userInfo.name, email: userInfo.email }
      );
    } catch (e: any) {
      console.error(
        "[OAuth GitHub] Error fetching user info from GitHub API:",
        e
      );
      const statusCode = e.statusCode || e.response?.status || 500;
      const statusMessage =
        e.statusMessage ||
        e.response?.statusText ||
        "Failed to fetch user info";
      const message =
        e.data?.message ||
        e.message ||
        "Unknown error during GitHub user info fetch.";
      throw createError({ statusCode, statusMessage, message });
    }

    const userID = String(userInfo.id);
    // GitHub might return null for email if not public or verified.
    // Use a placeholder if email is null, or ensure your addUser method can handle null/undefined email.
    const userEmail = userInfo.email || `user-${userID}@example.com`; // Fallback email
    console.log(
      `[OAuth GitHub] User ID for DB: ${userID}, Email for DB: ${userEmail}`
    );

    try {
      console.log("[OAuth GitHub] Adding/updating user in DB...");
      await userTable.addUser(userID, userEmail, "github");
      console.log("[OAuth GitHub] User added/updated in DB successfully.");
    } catch (e: any) {
      console.error("[OAuth GitHub] Error adding/updating user in DB:", e);
      throw createError({
        statusCode: 500,
        statusMessage: "Server Error - DB User Operation Failed",
        message: `DB user operation error: ${
          e.message || "Unknown DB user operation failure."
        }`,
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("[OAuth GitHub] Error: JWT_SECRET not configured in .env.");
      throw createError({
        statusCode: 500,
        statusMessage: "Server Configuration Error",
        message: "JWT secret missing on server.",
      });
    }
    let jwtToken: string;
    try {
      console.log("[OAuth GitHub] Signing JWT...");
      jwtToken = await new SignJWT({
        id: userID,
        type: "github",
      })
        .setExpirationTime("60d")
        .setProtectedHeader({ alg: "HS256" })
        .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
      console.log("[OAuth GitHub] JWT signed successfully.");
    } catch (e: any) {
      console.error("[OAuth GitHub] Error signing JWT:", e);
      throw createError({
        statusCode: 500,
        statusMessage: "Server Error - JWT Signing Failed",
        message: `JWT signing error: ${
          e.message || "Unknown JWT signing failure."
        }`,
      });
    }

    const params = new URLSearchParams({
      login: "github",
      jwt: jwtToken,
      user: JSON.stringify({
        avatar: userInfo.avatar_url,
        name: userInfo.name,
      }),
    });
    const redirectUrl = `/?${params.toString()}`;
    console.log(`[OAuth GitHub] Redirecting to client: ${redirectUrl}`);
    return sendRedirect(event, redirectUrl);
  } catch (error: any) {
    // This is a top-level catch for any errors not caught by more specific blocks
    // or errors thrown directly by defineEventHandler's infrastructure if misused.
    console.error(
      "[OAuth GitHub] CRITICAL: Unhandled error in OAuth GitHub handler:",
      error
    );
    // If it's already an H3Error created by createError, rethrow it.
    // Otherwise, create a new one.
    if (error.statusCode && error.statusMessage) {
      throw error;
    }
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || "Internal Server Error",
      message: `OAuth unhandled error: ${
        error.message || "An unexpected error occurred."
      }`,
    });
  }
});
