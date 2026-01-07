import { Shot } from '../types';

const API_KEY_STORAGE_KEY = 'rayshot_gemini_api_key';
const DOUBAO_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
const DOUBAO_MODEL = 'doubao-seedream-4-5-251128';

export interface GeminiImageResponse {
  dataUrl: string;
  error?: string;
}

/**
 * Get the stored API key
 */
export const getApiKey = (): string | null => {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
};

/**
 * Save the API key
 */
export const saveApiKey = (key: string): void => {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
};

/**
 * Build the prompt for storyboard sketch generation
 * Fixed style: 简笔的草图 (simple line sketch)
 * Then combines with specific shot information
 */
const buildSketchPrompt = (shot: Shot, sceneLocation: string, sceneTime: string): string => {
  const parts: string[] = [];
  
  // Fixed style: 简笔的草图 (simple line sketch style)
  parts.push('简笔的草图，黑白线条，简洁的铅笔线条，无阴影，无写实效果');
  
  // Add scene description
  if (shot.description) {
    parts.push(`画面内容：${shot.description}`);
  }
  
  // Add camera information
  if (shot.size || shot.perspective) {
    const cameraParts: string[] = [];
    if (shot.size) cameraParts.push(shot.size);
    if (shot.perspective) cameraParts.push(shot.perspective);
    if (cameraParts.length > 0) {
      parts.push(`镜头：${cameraParts.join('，')}`);
    }
  }
  
  // Add movement
  if (shot.movement && shot.movement !== 'Static') {
    parts.push(`运镜：${shot.movement}`);
  }
  
  // Add location and time context
  if (sceneLocation) {
    parts.push(`地点：${sceneLocation}`);
  }
  
  if (sceneTime) {
    parts.push(`时间：${sceneTime}`);
  }
  
  return parts.join('。');
};

/**
 * Convert aspect ratio string to Doubao size format
 * Doubao supports: "1:1", "16:9", "9:16", "4:3", "3:4"
 * Default to "9:16" for vertical storyboard
 */
const convertAspectRatioToSize = (aspectRatio: string): string => {
  // Normalize the aspect ratio
  const normalized = aspectRatio.trim().toLowerCase();
  
  // Map common aspect ratios
  if (normalized === '9:16' || normalized === '16:9') {
    return normalized.toUpperCase();
  }
  if (normalized === '1:1') {
    return '1:1';
  }
  if (normalized === '4:3' || normalized === '3:4') {
    return normalized.toUpperCase();
  }
  
  // Default to 9:16 for storyboard
  return '9:16';
};

/**
 * Fetch image from URL and convert to base64 data URL
 */
const fetchImageAsDataUrl = async (imageUrl: string): Promise<string> => {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert image to data URL'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error: any) {
    throw new Error(`Failed to fetch image: ${error.message}`);
  }
};

/**
 * Generate storyboard sketch using Doubao Seedream API
 */
export const generateStoryboardSketch = async (
  shot: Shot,
  sceneLocation: string,
  sceneTime: string
): Promise<GeminiImageResponse> => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return {
      dataUrl: '',
      error: 'API Key not configured. Please set your API Key in settings.'
    };
  }

  // Build the prompt
  const prompt = buildSketchPrompt(shot, sceneLocation, sceneTime);
  
  // Use Doubao Seedream API for image generation
  return await generateWithDoubao(apiKey, prompt, shot.aspectRatio);
};

/**
 * Generate image using Doubao Seedream API
 * First tries b64_json format, falls back to URL if not supported
 */
const generateWithDoubao = async (
  apiKey: string,
  prompt: string,
  aspectRatio: string
): Promise<GeminiImageResponse> => {
  // Try base64 format first (no CORS issues)
  const base64Result = await tryGenerateWithBase64(apiKey, prompt);
  if (base64Result.dataUrl) {
    return base64Result;
  }
  
  // Fallback to URL format (direct use, img tag can load cross-origin images)
  return await tryGenerateWithUrl(apiKey, prompt);
};

/**
 * Try generating with base64 format
 */
const tryGenerateWithBase64 = async (
  apiKey: string,
  prompt: string
): Promise<GeminiImageResponse> => {
  try {
    const endpoint = `${DOUBAO_API_BASE}/images/generations`;
    
    const requestBody = {
      model: DOUBAO_MODEL,
      prompt: prompt,
      sequential_image_generation: 'disabled',
      response_format: 'b64_json', // Try base64 format
      size: '2K',
      stream: false,
      watermark: true
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      // If base64 format is not supported, return empty to try URL format
      return { dataUrl: '', error: '' };
    }

    const data = await response.json();
    
    // Parse base64 response
    if (data.data && data.data.length > 0) {
      const imageData = data.data[0];
      if (imageData.b64_json) {
        return {
          dataUrl: `data:image/png;base64,${imageData.b64_json}`
        };
      }
    }
    
    return { dataUrl: '', error: '' };
  } catch (error: any) {
    // Silently fail and try URL format
    return { dataUrl: '', error: '' };
  }
};

/**
 * Generate with URL format (direct use, no CORS conversion needed)
 */
const tryGenerateWithUrl = async (
  apiKey: string,
  prompt: string
): Promise<GeminiImageResponse> => {
  try {
    const endpoint = `${DOUBAO_API_BASE}/images/generations`;
    
    const requestBody = {
      model: DOUBAO_MODEL,
      prompt: prompt,
      sequential_image_generation: 'disabled',
      response_format: 'url',
      size: '2K',
      stream: false,
      watermark: true
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.message || `API request failed: ${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Parse Doubao API response
    if (data.data && data.data.length > 0) {
      const imageUrl = data.data[0].url;
      
      if (!imageUrl) {
        return {
          dataUrl: '',
          error: 'API响应中没有找到图片URL'
        };
      }
      
      // Directly use URL - img tag can load cross-origin images
      // Note: URL may expire, but it will work for display
      return {
        dataUrl: imageUrl
      };
    }
    
    // Check for alternative response format
    if (data.url) {
      return {
        dataUrl: data.url
      };
    }
    
    return {
      dataUrl: '',
      error: `意外的API响应格式。响应数据：${JSON.stringify(data).substring(0, 200)}...`
    };
    
  } catch (error: any) {
    console.error('Doubao API error:', error);
    return {
      dataUrl: '',
      error: error.message || '生成草图失败。请检查您的API密钥和网络连接。'
    };
  }
};
