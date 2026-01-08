import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Tag, Edit2 } from 'lucide-react';
import { ProjectKeyword } from '../types';

interface SceneElementsConfigProps {
  isOpen: boolean;
  onClose: () => void;
  elements: ProjectKeyword[];
  keywords: ProjectKeyword[];
  outline?: string;
  onSave: (elements: ProjectKeyword[]) => void;
  onOutlineChange?: (outline: string) => void;
}

export const SceneElementsConfig: React.FC<SceneElementsConfigProps> = ({
  isOpen,
  onClose,
  elements,
  keywords,
  outline = '',
  onSave,
  onOutlineChange
}) => {
  const [localElements, setLocalElements] = useState<ProjectKeyword[]>(elements);
  const [selectedKeyword, setSelectedKeyword] = useState<string>('');
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [localOutline, setLocalOutline] = useState<string>(outline);
  
  // 手动添加表单状态
  const [manualForm, setManualForm] = useState<ProjectKeyword>({
    name: '',
    category: 'Character',
    visual_traits: ''
  });

  useEffect(() => {
    if (isOpen) {
      setLocalElements(elements);
      setLocalOutline(outline);
      setSelectedKeyword('');
      setIsAddingManual(false);
      setEditingIndex(null);
      setManualForm({
        name: '',
        category: 'Character',
        visual_traits: ''
      });
    }
  }, [isOpen, elements, outline]);

  // 检查要素是否已添加（通过名称判断）
  const isElementAdded = (name: string): boolean => {
    return localElements.some(e => e.name === name);
  };

  const handleAddKeyword = () => {
    if (!selectedKeyword) return;
    const keyword = keywords.find(k => k.name === selectedKeyword);
    if (keyword && !isElementAdded(keyword.name)) {
      setLocalElements([...localElements, { ...keyword }]);
      setSelectedKeyword('');
    }
  };

  const handleStartManualAdd = () => {
    setIsAddingManual(true);
    setManualForm({
      name: '',
      category: 'Character',
      visual_traits: ''
    });
  };

  const handleSaveManual = () => {
    const trimmedName = manualForm.name.trim();
    if (trimmedName && !isElementAdded(trimmedName)) {
      setLocalElements([...localElements, { ...manualForm, name: trimmedName }]);
      setIsAddingManual(false);
      setManualForm({
        name: '',
        category: 'Character',
        visual_traits: ''
      });
    }
  };

  const handleCancelManual = () => {
    setIsAddingManual(false);
    setManualForm({
      name: '',
      category: 'Character',
      visual_traits: ''
    });
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
  };

  const handleSaveEdit = (index: number, updated: ProjectKeyword) => {
    const updatedElements = [...localElements];
    updatedElements[index] = updated;
    setLocalElements(updatedElements);
    setEditingIndex(null);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  const handleRemoveElement = (index: number) => {
    setLocalElements(localElements.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave(localElements);
    if (onOutlineChange) {
      onOutlineChange(localOutline);
    }
    onClose();
  };

  const handleCancel = () => {
    setLocalElements(elements);
    setLocalOutline(outline);
    onClose();
  };

  if (!isOpen) return null;

  // 获取未添加的关键词
  const availableKeywords = keywords.filter(k => !isElementAdded(k.name));

  const getCategoryLabel = (category: ProjectKeyword['category']): string => {
    return category === 'Character' ? '角色' : category === 'Location' ? '地点' : '物品';
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">场景要素配置</h2>
          <button
            onClick={handleCancel}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 场景大纲 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">
              场景大纲
            </label>
            <textarea
              value={localOutline}
              onChange={(e) => setLocalOutline(e.target.value)}
              placeholder="输入场景大纲（用于AI参考）..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 h-24 resize-y"
            />
          </div>

          {/* 从项目关键词添加 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">
              从项目关键词添加
            </label>
            <div className="flex gap-2">
              <select
                value={selectedKeyword}
                onChange={(e) => setSelectedKeyword(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">选择关键词...</option>
                {availableKeywords.map((keyword, index) => (
                  <option key={index} value={keyword.name}>
                    {keyword.name} ({getCategoryLabel(keyword.category)})
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddKeyword}
                disabled={!selectedKeyword}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Plus size={16} />
                添加
              </button>
            </div>
          </div>

          {/* 手动添加 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-zinc-300">
                手动添加要素
              </label>
              {!isAddingManual && (
                <button
                  onClick={handleStartManualAdd}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded text-xs font-medium transition-colors flex items-center gap-2"
                >
                  <Plus size={14} />
                  新建要素
                </button>
              )}
            </div>
            {isAddingManual && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    名称 *
                  </label>
                  <input
                    type="text"
                    value={manualForm.name}
                    onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                    placeholder="输入要素名称..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    类别 *
                  </label>
                  <select
                    value={manualForm.category}
                    onChange={(e) => setManualForm({ ...manualForm, category: e.target.value as ProjectKeyword['category'] })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="Character">角色</option>
                    <option value="Location">地点</option>
                    <option value="Item">物品</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    简要介绍
                  </label>
                  <textarea
                    value={manualForm.visual_traits || ''}
                    onChange={(e) => setManualForm({ ...manualForm, visual_traits: e.target.value })}
                    placeholder="描述要素的简要介绍..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 h-20 resize-y"
                  />
                </div>
                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    onClick={handleCancelManual}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveManual}
                    disabled={!manualForm.name.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white rounded transition-colors"
                  >
                    添加
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 已添加的要素列表 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">
              已添加的要素 ({localElements.length})
            </label>
            {localElements.length === 0 ? (
              <div className="text-sm text-zinc-500 py-4 text-center">
                暂无要素，请从上方添加
              </div>
            ) : (
              <div className="space-y-3">
                {localElements.map((element, index) => (
                  <div
                    key={index}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg p-4"
                  >
                    {editingIndex === index ? (
                      <ElementEditForm
                        element={element}
                        onSave={(updated) => handleSaveEdit(index, updated)}
                        onCancel={handleCancelEdit}
                      />
                    ) : (
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <Tag size={14} className="text-cyan-400" />
                            <span className="text-sm font-medium text-zinc-100">{element.name}</span>
                            <span className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                              {getCategoryLabel(element.category)}
                            </span>
                          </div>
                          {element.visual_traits && (
                            <p className="text-xs text-zinc-400 mt-1">{element.visual_traits}</p>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => handleStartEdit(index)}
                            className="p-1.5 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 rounded transition-colors"
                            title="编辑"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleRemoveElement(index)}
                            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-800">
          <button
            onClick={handleCancel}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-sm font-medium transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm font-medium transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

// 要素编辑表单组件
interface ElementEditFormProps {
  element: ProjectKeyword;
  onSave: (updated: ProjectKeyword) => void;
  onCancel: () => void;
}

const ElementEditForm: React.FC<ElementEditFormProps> = ({ element, onSave, onCancel }) => {
  const [form, setForm] = useState<ProjectKeyword>(element);

  const handleSave = () => {
    onSave({ ...form, name: form.name.trim() });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
          名称 *
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
          类别 *
        </label>
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as ProjectKeyword['category'] })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="Character">角色</option>
          <option value="Location">地点</option>
          <option value="Item">物品</option>
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
          简要介绍
        </label>
        <textarea
          value={form.visual_traits || ''}
          onChange={(e) => setForm({ ...form, visual_traits: e.target.value })}
          placeholder="描述要素的简要介绍..."
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 h-20 resize-y"
        />
      </div>
      <div className="flex items-center justify-end space-x-2 pt-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={!form.name.trim()}
          className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          保存
        </button>
      </div>
    </div>
  );
};
