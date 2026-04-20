import { createServer } from "node:http"
import { randomUUID } from "node:crypto"

const HOST = process.env.HOST ?? "127.0.0.1"
const PORT = Number(process.env.PORT ?? 62900)
const APP_KEY = process.env.BAIDU_PAN_APP_KEY?.trim() ?? ""
const APP_SECRET = process.env.BAIDU_PAN_APP_SECRET?.trim() ?? ""
const PUBLIC_BASE_URL = (process.env.METIS_BAIDU_PAN_BROKER_PUBLIC_URL?.trim() || `http://${HOST}:${PORT}`).replace(/\/$/, "")
const BAIDU_AUTHORIZE_URL = "https://openapi.baidu.com/oauth/2.0/authorize"
const BAIDU_TOKEN_URL = "https://openapi.baidu.com/oauth/2.0/token"
const BAIDU_USERINFO_URL = "https://openapi.baidu.com/rest/2.0/passport/users/getInfo"
const START_PATH = "/oauth/baidu-pan/start"
const CALLBACK_PATH = "/oauth/baidu-pan/callback"
const EXCHANGE_PATH = "/oauth/baidu-pan/exchange"
const REFRESH_PATH = "/oauth/baidu-pan/refresh"
const HEALTH_PATH = "/health"
const SESSION_TTL_MS = 10 * 60 * 1000
const TOKEN_TTL_MS = 10 * 60 * 1000

const pendingAuthorizations = new Map()
const pendingExchanges = new Map()

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  response.end(JSON.stringify(payload))
}

function redirect(response, location) {
  response.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
  })
  response.end()
}

function getBrokerCallbackUrl() {
  return `${PUBLIC_BASE_URL}${CALLBACK_PATH}`
}

function assertConfigured() {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error("BAIDU_PAN_APP_KEY and BAIDU_PAN_APP_SECRET must be configured")
  }
}

function isLoopbackCallback(callbackUrl) {
  try {
    const url = new URL(callbackUrl)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1")
    )
  } catch {
    return false
  }
}

function appendParams(urlString, params) {
  const url = new URL(urlString)

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

async function readJsonBody(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

async function fetchJson(url) {
  const response = await fetch(url)
  const payload = await response.json()

  if (!response.ok || payload.error) {
    const reason = payload.error_description ?? payload.error ?? `HTTP ${response.status}`
    throw new Error(reason)
  }

  return payload
}

async function exchangeAuthorizationCode(code) {
  const url = new URL(BAIDU_TOKEN_URL)
  url.searchParams.set("grant_type", "authorization_code")
  url.searchParams.set("code", code)
  url.searchParams.set("client_id", APP_KEY)
  url.searchParams.set("client_secret", APP_SECRET)
  url.searchParams.set("redirect_uri", getBrokerCallbackUrl())

  const payload = await fetchJson(url.toString())

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: new Date(Date.now() + payload.expires_in * 1000).toISOString(),
  }
}

async function refreshAuthorization(refreshToken) {
  const url = new URL(BAIDU_TOKEN_URL)
  url.searchParams.set("grant_type", "refresh_token")
  url.searchParams.set("refresh_token", refreshToken)
  url.searchParams.set("client_id", APP_KEY)
  url.searchParams.set("client_secret", APP_SECRET)

  const payload = await fetchJson(url.toString())

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: new Date(Date.now() + payload.expires_in * 1000).toISOString(),
  }
}

async function fetchUserInfo(accessToken) {
  const url = new URL(BAIDU_USERINFO_URL)
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("get_unionid", "1")

  try {
    const response = await fetch(url.toString())
    const payload = await response.json()

    if (!response.ok || payload.error_code) {
      return {
        accountName: null,
        openId: null,
      }
    }

    return {
      accountName: payload.username ?? payload.userid ?? null,
      openId: payload.openid ?? payload.unionid ?? null,
    }
  } catch {
    return {
      accountName: null,
      openId: null,
    }
  }
}

function cleanupExpiredSessions() {
  const now = Date.now()

  for (const [key, value] of pendingAuthorizations) {
    if (now - value.createdAt > SESSION_TTL_MS) {
      pendingAuthorizations.delete(key)
    }
  }

  for (const [key, value] of pendingExchanges) {
    if (now - value.createdAt > TOKEN_TTL_MS) {
      pendingExchanges.delete(key)
    }
  }
}

setInterval(cleanupExpiredSessions, 60_000).unref()

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", PUBLIC_BASE_URL)

    if (request.method === "GET" && requestUrl.pathname === HEALTH_PATH) {
      json(response, 200, {
        ok: true,
        mode: "broker",
        pkceSupported: false,
        brokerBaseUrl: PUBLIC_BASE_URL,
      })
      return
    }

    if (request.method === "GET" && requestUrl.pathname === START_PATH) {
      assertConfigured()

      const callbackUrl = requestUrl.searchParams.get("callback_url")
      const clientState = requestUrl.searchParams.get("state")

      if (!callbackUrl || !clientState || !isLoopbackCallback(callbackUrl)) {
        json(response, 400, { error: "A valid loopback callback_url and state are required" })
        return
      }

      const brokerState = randomUUID()
      pendingAuthorizations.set(brokerState, {
        callbackUrl,
        clientState,
        createdAt: Date.now(),
      })

      const authorizeUrl = new URL(BAIDU_AUTHORIZE_URL)
      authorizeUrl.searchParams.set("response_type", "code")
      authorizeUrl.searchParams.set("client_id", APP_KEY)
      authorizeUrl.searchParams.set("redirect_uri", getBrokerCallbackUrl())
      authorizeUrl.searchParams.set("scope", "basic,netdisk")
      authorizeUrl.searchParams.set("display", "page")
      authorizeUrl.searchParams.set("state", brokerState)

      redirect(response, authorizeUrl.toString())
      return
    }

    if (request.method === "GET" && requestUrl.pathname === CALLBACK_PATH) {
      const brokerState = requestUrl.searchParams.get("state")
      const authorization = brokerState ? pendingAuthorizations.get(brokerState) : null

      if (!authorization) {
        json(response, 400, { error: "Authorization session not found or expired" })
        return
      }

      pendingAuthorizations.delete(brokerState)

      const error = requestUrl.searchParams.get("error")
      if (error) {
        redirect(
          response,
          appendParams(authorization.callbackUrl, {
            state: authorization.clientState,
            error,
          }),
        )
        return
      }

      const code = requestUrl.searchParams.get("code")

      if (!code) {
        redirect(
          response,
          appendParams(authorization.callbackUrl, {
            state: authorization.clientState,
            error: "missing_code",
          }),
        )
        return
      }

      const tokenResult = await exchangeAuthorizationCode(code)
      const userInfo = await fetchUserInfo(tokenResult.accessToken)
      const brokerCode = randomUUID()

      pendingExchanges.set(brokerCode, {
        ...tokenResult,
        ...userInfo,
        createdAt: Date.now(),
      })

      redirect(
        response,
        appendParams(authorization.callbackUrl, {
          state: authorization.clientState,
          broker_code: brokerCode,
        }),
      )
      return
    }

    if (request.method === "POST" && requestUrl.pathname === EXCHANGE_PATH) {
      const body = await readJsonBody(request)
      const brokerCode = typeof body.brokerCode === "string" ? body.brokerCode : ""
      const exchange = pendingExchanges.get(brokerCode)

      if (!exchange) {
        json(response, 400, { error: "Broker code not found or already consumed" })
        return
      }

      pendingExchanges.delete(brokerCode)
      json(response, 200, {
        accessToken: exchange.accessToken,
        refreshToken: exchange.refreshToken,
        expiresAt: exchange.expiresAt,
        accountName: exchange.accountName,
        openId: exchange.openId,
      })
      return
    }

    if (request.method === "POST" && requestUrl.pathname === REFRESH_PATH) {
      assertConfigured()
      const body = await readJsonBody(request)
      const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken.trim() : ""

      if (!refreshToken) {
        json(response, 400, { error: "refreshToken is required" })
        return
      }

      const tokenResult = await refreshAuthorization(refreshToken)
      json(response, 200, {
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        expiresAt: tokenResult.expiresAt,
      })
      return
    }

    json(response, 404, { error: "Not found" })
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[baidu-pan-broker] listening on ${PUBLIC_BASE_URL}`)
  console.log(`[baidu-pan-broker] health: ${PUBLIC_BASE_URL}${HEALTH_PATH}`)
  console.log(`[baidu-pan-broker] registered Baidu callback: ${getBrokerCallbackUrl()}`)
  console.log("[baidu-pan-broker] PKCE support: not supported by documented Baidu OAuth flow")
})