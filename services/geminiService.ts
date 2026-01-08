import { Shot, ProjectKeyword } from '../types';

const DOUBAO_API_KEY_STORAGE_KEY = 'rayshot_doubao_api_key';
const GEMINI_API_KEY_STORAGE_KEY = 'rayshot_gemini_api_key';
const DOUBAO_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
const DOUBAO_MODEL = 'doubao-seedream-4-5-251128';

export interface GeminiImageResponse {
  dataUrl: string;
  error?: string;
}

/**
 * Get the stored Doubao API key (for image generation)
 */
export const getApiKey = (): string | null => {
  return localStorage.getItem(DOUBAO_API_KEY_STORAGE_KEY);
};

/**
 * Save the Doubao API key (for image generation)
 */
export const saveApiKey = (key: string): void => {
  localStorage.setItem(DOUBAO_API_KEY_STORAGE_KEY, key);
};

/**
 * Get the stored API key (for text analysis - now using DeepSeek)
 */
export const getGeminiApiKey = (): string | null => {
  return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY);
};

/**
 * Save the API key (for text analysis - now using DeepSeek)
 */
export const saveGeminiApiKey = (key: string): void => {
  localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key);
};

/**
 * List available Gemini models for the API key
 */
export const listAvailableModels = async (): Promise<{ models: string[]; error?: string }> => {
  const apiKey = getGeminiApiKey();
  
  if (!apiKey) {
    return {
      models: [],
      error: 'Gemini API Key not configured.'
    };
  }

  try {
    // Try both v1 and v1beta endpoints
    const endpoints = [
      `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        
        if (response.ok) {
          const data = await response.json();
          const models: string[] = [];
          
          if (data.models && Array.isArray(data.models)) {
            data.models.forEach((model: any) => {
              if (model.name) {
                // Extract model name (e.g., "models/gemini-1.5-flash" -> "gemini-1.5-flash")
                const modelName = model.name.replace(/^models\//, '');
                if (model.supportedGenerationMethods?.includes('generateContent')) {
                  models.push(modelName);
                }
              }
            });
          }
          
          return { models: models.sort() };
        }
      } catch (err) {
        // Try next endpoint
        continue;
      }
    }
    
    return {
      models: [],
      error: 'Failed to fetch available models from both API versions.'
    };
  } catch (error: any) {
    return {
      models: [],
      error: error.message || 'Failed to list models.'
    };
  }
};

/**
 * Build the prompt for storyboard sketch generation
 * Fixed style: 简笔的草图 (simple line sketch)
 * Then combines with specific shot information
 */
const buildSketchPrompt = (shot: Shot, sceneLocation: string, sceneTime: string, sceneOutline?: string, sceneElements?: ProjectKeyword[]): string => {
  const parts: string[] = [];
  
  // Fixed style: 简笔的草图 (simple line sketch style)
  parts.push('简笔的草图，黑白线条，简洁的铅笔线条，无阴影，无写实效果');
  
  // Add scene outline if available (for AI context)
  if (sceneOutline) {
    parts.push(`场景背景：${sceneOutline}`);
  }
  
  // Add scene elements if available (for AI context)
  if (sceneElements && sceneElements.length > 0) {
    const elementDescriptions = sceneElements.map(el => {
      const categoryLabel = el.category === 'Character' ? '角色' : el.category === 'Location' ? '地点' : '物品';
      let desc = `${el.name}（${categoryLabel}）`;
      if (el.visual_traits) {
        desc += `：${el.visual_traits}`;
      }
      return desc;
    });
    parts.push(`关键要素：${elementDescriptions.join('、')}`);
  }
  
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
  sceneTime: string,
  sceneOutline?: string,
  sceneElements?: ProjectKeyword[]
): Promise<GeminiImageResponse> => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return {
      dataUrl: '',
      error: 'API Key not configured. Please set your API Key in settings.'
    };
  }

  // Build the prompt
  const prompt = buildSketchPrompt(shot, sceneLocation, sceneTime, sceneOutline, sceneElements);
  
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

/**
 * Get AI suggestions for camera settings based on shot description
 */
export interface CameraSuggestion {
  shot_size: string;
  perspective: string;
  movement: string;
  focal_length: string;
  ert: string; // 时长（秒）
  reasoning?: string;
}

export const suggestCameraSettings = async (
  description: string,
  sceneLocation: string,
  previousShot?: { size?: string; movement?: string },
  sceneOutline?: string,
  sceneElements?: ProjectKeyword[]
): Promise<{ suggestion: CameraSuggestion | null; error?: string }> => {
  // Use Doubao API key (same as image generation)
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return {
      suggestion: null,
      error: 'Doubao API Key not configured.'
    };
  }

  if (!description || description.trim().length < 5) {
    return {
      suggestion: null,
      error: 'Description too short.'
    };
  }

  try {
    // Use Doubao API with DeepSeek v3.2 model
    const DOUBAO_CHAT_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
    const endpoint = `${DOUBAO_CHAT_API_BASE}/chat/completions`;
    
    const previousShotInfo = previousShot 
      ? `Previous Shot: ${previousShot.size || 'N/A'}, ${previousShot.movement || 'N/A'}`
      : 'Previous Shot: N/A';
    
    const sceneOutlineInfo = sceneOutline 
      ? `Scene Outline: ${sceneOutline}`
      : '';
    
    const sceneElementsInfo = sceneElements && sceneElements.length > 0
      ? `Scene Elements: ${sceneElements.map(el => {
          const categoryLabel = el.category === 'Character' ? '角色' : el.category === 'Location' ? '地点' : '物品';
          let info = `${el.name} (${categoryLabel})`;
          if (el.visual_traits) {
            info += ` - ${el.visual_traits}`;
          }
          return info;
        }).join(', ')}`
      : '';
    
    const prompt = `You are a professional Cinematographer assistant.
Based on the current Scene Heading and the Shot Description provided by the user, suggest the best technical parameters.

Context:
- Scene: ${sceneLocation}
${sceneOutlineInfo ? `- ${sceneOutlineInfo}` : ''}
${sceneElementsInfo ? `- ${sceneElementsInfo}` : ''}
- ${previousShotInfo}
- Current Description: '${description}'

Analyze the description content carefully to estimate the shot duration (ert):
- Simple static shots or quick reactions: 2-3 seconds
- Normal dialogue or action: 3-5 seconds
- Complex movements or multiple actions: 5-8 seconds
- Long establishing shots or slow reveals: 8-12 seconds

Return a JSON object ONLY (no markdown, no code blocks):
{
  "shot_size": "CU" (or MCU, MS, WS, EWS, FS, ECU, Cowboy),
  "perspective": "Eye-level" (or Low Angle, High Angle, Top-down, Bird's Eye, Worm's Eye, OTS, POV),
  "movement": "Static" (or Pan Left, Pan Right, Tilt Up, Tilt Down, Dolly In, Dolly Out, Truck, Pedestal, Zoom In, Zoom Out, Handheld, Whip Pan),
  "focal_length": "50mm (Standard)" (or "24mm (Wide)", "85mm (Portrait)", "100mm (Telephoto)", "35mm (Standard Wide)", "16mm (Wide)", "Macro"),
  "ert": "3" (estimated runtime in seconds based on the description content and complexity),
  "reasoning": "Short explanation in Chinese"
}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-v3-2-251201',
        messages: [
          {
            role: 'system',
            content: '你是专业的电影摄影师助手，擅长根据场景描述推荐最佳的镜头参数。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.error?.code || `API request failed: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Extract text from response
    let extractedText = '';
    if (data.choices && data.choices[0] && data.choices[0].message) {
      extractedText = data.choices[0].message.content || '';
    }

    // Try to parse JSON from response
    let jsonText = extractedText.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }

    try {
      const suggestion: CameraSuggestion = JSON.parse(jsonText);
      
      // Validate suggestion (ert is optional as it might not always be returned)
      if (!suggestion.shot_size || !suggestion.perspective || !suggestion.movement || !suggestion.focal_length) {
        throw new Error('Invalid suggestion format');
      }
      
      // Ensure ert is a string (convert if needed)
      if (suggestion.ert && typeof suggestion.ert === 'number') {
        suggestion.ert = String(suggestion.ert);
      }

      return { suggestion };
    } catch (parseError) {
      console.error('Failed to parse JSON from response:', parseError);
      console.error('Response text:', extractedText);
      return {
        suggestion: null,
        error: 'Failed to parse AI response.'
      };
    }
  } catch (error: any) {
    console.error('Camera suggestion error:', error);
    return {
      suggestion: null,
      error: error.message || '获取建议失败。'
    };
  }
};

/**
 * Analyze script text and extract entities (Characters, Locations, Items)
 * Using Doubao API with DeepSeek v3.2 model
 */
export const analyzeScriptContext = async (
  scriptText: string
): Promise<{ keywords: ProjectKeyword[]; error?: string }> => {
  // Use Doubao API key (same as image generation)
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return {
      keywords: [],
      error: 'Doubao API Key not configured. Please set your API Key in settings.'
    };
  }

  if (!scriptText || scriptText.trim().length === 0) {
    return {
      keywords: [],
      error: 'Please provide script text to analyze.'
    };
  }

  try {
    // Use Doubao API with DeepSeek v3.2 model
    const DOUBAO_CHAT_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
    const endpoint = `${DOUBAO_CHAT_API_BASE}/chat/completions`;
    
    const prompt = `Analyze the following script text and extract a structured JSON list of key entities.
Categories: 'Character', 'Location', 'Item'.
Format: [{"name": "Leah", "category": "Character", "visual_traits": "22yo Asian female, short hair, outdoor gear"}].
Focus on extracting visual descriptions that would be useful for image generation.
Return ONLY valid JSON array, no other text.

Script text:
${scriptText.substring(0, 10000)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-v3-2-251201',
        messages: [
          {
            role: 'system',
            content: '你是人工智能助手，擅长分析文本并提取结构化信息。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.error?.code || `API request failed: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Extract text from response
    let extractedText = '';
    if (data.choices && data.choices[0] && data.choices[0].message) {
      extractedText = data.choices[0].message.content || '';
    }

    // Try to parse JSON from response
    // Sometimes AI wraps JSON in markdown code blocks
    let jsonText = extractedText.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }

    try {
      const keywords: ProjectKeyword[] = JSON.parse(jsonText);
      
      // Validate and filter keywords
      const validKeywords = keywords.filter(k => 
        k && 
        typeof k.name === 'string' && 
        k.name.trim().length > 0 &&
        ['Character', 'Location', 'Item'].includes(k.category)
      );

      return { keywords: validKeywords };
    } catch (parseError) {
      console.error('Failed to parse JSON from response:', parseError);
      console.error('Response text:', extractedText);
      return {
        keywords: [],
        error: 'Failed to parse AI response. Please try again.'
      };
    }
  } catch (error: any) {
    console.error('Script analysis error:', error);
    return {
      keywords: [],
      error: error.message || '分析脚本失败。请检查您的API密钥和网络连接。'
    };
  }
};

/**
 * 提取场景中所有镜头的对白和特效文字
 */
export interface DialogueExtraction {
  shotNumber: number; // 镜头序号
  dialogue?: string; // 对白内容
  effects?: string; // 特效文字内容
}

export interface ExtractDialoguesResult {
  extractions: DialogueExtraction[];
  error?: string;
}

export const extractDialoguesAndEffects = async (
  shotDescriptions: Array<{ shotNumber: number; description: string }>,
  sceneLocation: string,
  sceneOutline?: string,
  sceneElements?: ProjectKeyword[],
  projectKeywords?: ProjectKeyword[]
): Promise<ExtractDialoguesResult> => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return {
      extractions: [],
      error: 'Doubao API Key not configured.'
    };
  }

  if (!shotDescriptions || shotDescriptions.length === 0) {
    return {
      extractions: [],
      error: 'No shot descriptions provided.'
    };
  }

  try {
    const DOUBAO_CHAT_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
    const endpoint = `${DOUBAO_CHAT_API_BASE}/chat/completions`;
    
    // 构建场景上下文信息
    const sceneContextParts: string[] = [];
    sceneContextParts.push(`场景：${sceneLocation}`);
    
    if (sceneOutline) {
      sceneContextParts.push(`场景大纲：${sceneOutline}`);
    }
    
    if (sceneElements && sceneElements.length > 0) {
      const elementsInfo = sceneElements.map(el => {
        const categoryLabel = el.category === 'Character' ? '角色' : el.category === 'Location' ? '地点' : '物品';
        let info = `${el.name}（${categoryLabel}）`;
        if (el.visual_traits) {
          info += `：${el.visual_traits}`;
        }
        return info;
      }).join('、');
      sceneContextParts.push(`场景要素：${elementsInfo}`);
    }
    
    if (projectKeywords && projectKeywords.length > 0) {
      const keywordsInfo = projectKeywords.map(k => {
        const categoryLabel = k.category === 'Character' ? '角色' : k.category === 'Location' ? '地点' : '物品';
        return `${k.name}（${categoryLabel}）`;
      }).join('、');
      sceneContextParts.push(`项目关键词：${keywordsInfo}`);
    }
    
    // 构建画面描述列表
    const descriptionsText = shotDescriptions.map((shot) => {
      return `镜头${shot.shotNumber}：${shot.description}`;
    }).join('\n');
    
    const prompt = `你是一个专业的剧本分析助手。请基于以下场景信息和画面描述，提取每个镜头中涉及的角色对白和特效文字。

${sceneContextParts.join('\n')}

画面描述：
${descriptionsText}

要求：
1. 仔细分析每个画面描述，只提取明确涉及对白或特效文字的内容
2. 对白格式：角色名："对白内容"
3. 特效文字格式：（特效文字内容）
4. 如果画面描述中没有对白或特效文字，则不需要提取
5. 保持提取内容的原始格式和语气

请返回JSON格式（不要markdown，不要代码块）：
{
  "extractions": [
    {
      "shotNumber": 1,
      "dialogue": "角色名："对白内容"" 或 null（如果没有对白）,
      "effects": "（特效文字）" 或 null（如果没有特效文字）
    },
    ...
  ]
}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-v3-2-251201',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的剧本分析助手，擅长从画面描述中提取对白和特效文字。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.error?.code || `API request failed: ${response.status}`;
      return {
        extractions: [],
        error: errorMessage
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      return {
        extractions: [],
        error: 'No response content from API.'
      };
    }

    // 尝试解析JSON响应
    let jsonText = content.trim();
    // 移除可能的markdown代码块标记
    if (jsonText.startsWith('```')) {
      const lines = jsonText.split('\n');
      lines.shift(); // 移除第一行（```json或```）
      if (lines[lines.length - 1].trim() === '```') {
        lines.pop(); // 移除最后一行（```）
      }
      jsonText = lines.join('\n');
    }

    try {
      const result = JSON.parse(jsonText);
      
      // 验证和转换结果
      if (!result.extractions || !Array.isArray(result.extractions)) {
        return {
          extractions: [],
          error: 'Invalid response format: missing extractions array.'
        };
      }

      const extractions: DialogueExtraction[] = result.extractions
        .filter((ext: any) => ext && typeof ext.shotNumber === 'number')
        .map((ext: any) => ({
          shotNumber: ext.shotNumber,
          dialogue: ext.dialogue && typeof ext.dialogue === 'string' ? ext.dialogue.trim() : undefined,
          effects: ext.effects && typeof ext.effects === 'string' ? ext.effects.trim() : undefined
        }))
        .filter((ext: DialogueExtraction) => ext.dialogue || ext.effects); // 只保留有内容的提取

      return { extractions };
    } catch (parseError: any) {
      return {
        extractions: [],
        error: `Failed to parse JSON response: ${parseError.message}`
      };
    }
  } catch (error: any) {
    return {
      extractions: [],
      error: error.message || 'Failed to extract dialogues and effects.'
    };
  }
};
