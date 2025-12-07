// /api/edge.js
export const config = { 
    runtime: 'edge',
  };
  
  export default async function handler(req) {
    console.log('--- DEBUG: Edge Function 被调用 ---', new Date().toISOString());
    // 1. 处理 CORS 预检请求
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key',
        },
      });
    }
  
    // 2. 获取并准备 Gemini API 密钥
    // 优先级：请求头(x-goog-api-key) > 查询参数(key) > 环境变量
    let apiKey = req.headers.get('x-goog-api-key');
    
    if (!apiKey) {
      const url = new URL(req.url);
      apiKey = url.searchParams.get('key');
    }
    
    if (!apiKey) {
      // 可选：你可以在这里设置一个后备环境变量密钥
      // apiKey = process.env.GEMINI_API_KEY;
      // 但注意，在SillyTavern中直接提供密钥更安全，这里可以先不设置
      return new Response(JSON.stringify({ 
        error: 'API key is missing. Please provide it in the `x-goog-api-key` header or `key` query parameter.' 
      }), { 
        status: 401, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }
  
    // 3. 提取原始请求的路径和查询参数
    const url = new URL(req.url);
    // 因为vercel.json重写了路由，需要去掉 `/api/edge` 前缀，恢复成 Gemini API 路径
    // 例如：/api/edge/models/gemini-pro:generateContent -> /v1beta/models/gemini-pro:generateContent
    const pathWithQuery = url.pathname.replace('/api/edge', '/v1beta') + url.search;
  
    // 4. 构建转发到 Google Gemini API 的 URL
    const targetUrl = `https://generativelanguage.googleapis.com${pathWithQuery}`;
  
    // 5. 准备转发请求
    const forwardHeaders = new Headers(req.headers);
    // 确保使用正确的 API 密钥
    forwardHeaders.set('x-goog-api-key', apiKey);
    // 移除可能引起问题的头（如 host）
    forwardHeaders.delete('host');
  
    try {
      // 6. 转发请求
      const fetchResponse = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      });
  
      // 7. 获取响应并返回
      const responseBody = await fetchResponse.text();
      const responseHeaders = new Headers(fetchResponse.headers);
      // 添加 CORS 头
      responseHeaders.set('Access-Control-Allow-Origin', '*');
  
      return new Response(responseBody, {
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers: responseHeaders,
      });
  
    } catch (error) {
      // 8. 错误处理
      console.error('Proxy request failed:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to forward request to Gemini API', 
        details: error.message 
      }), { 
        status: 502, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }
  }