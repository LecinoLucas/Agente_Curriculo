import { useEffect, useState } from "react";
import type { BehavioralAssessmentTemplate } from "../../../types/domain";
import { behavioralTemplatesService } from "../../../services/behavioralTemplatesService";

interface BehavioralTemplateSelectorProps {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
}

export function BehavioralTemplateSelector({ value, onChange }: BehavioralTemplateSelectorProps) {
  const [templates, setTemplates] = useState<BehavioralAssessmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<BehavioralAssessmentTemplate | null>(null);

  useEffect(() => {
    loadActiveTemplates();
  }, []);

  useEffect(() => {
    if (value && templates.length > 0) {
      const template = templates.find((t) => t.id === value);
      setSelectedTemplate(template || null);
    } else {
      setSelectedTemplate(null);
    }
  }, [value, templates]);

  async function loadActiveTemplates() {
    try {
      const data = await behavioralTemplatesService.listActiveTemplates();
      setTemplates(data);
    } catch (_err) {
      // Silent fail, templates are optional
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  const handleChange = (templateId: string) => {
    onChange(templateId === "" ? null : templateId);
  };

  const handleRemove = () => {
    onChange(null);
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Carregando templates...</div>;
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">Template Comportamental</label>

      <select
        value={value || ""}
        onChange={(e) => handleChange(e.target.value)}
        className="ui-input"
      >
        <option value="">Nenhum template</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name} ({template.competency_count} competências, {template.question_count} perguntas)
          </option>
        ))}
      </select>

      {selectedTemplate && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900">{selectedTemplate.name}</p>
              {selectedTemplate.description && (
                <p className="mt-1 text-xs text-blue-700">{selectedTemplate.description}</p>
              )}
              <div className="mt-2 flex gap-2 text-xs text-blue-600">
                <span>{selectedTemplate.competency_count} competências</span>
                <span>•</span>
                <span>{selectedTemplate.question_count} perguntas</span>
                <span>•</span>
                <span>v{selectedTemplate.version}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="ml-2 text-blue-600 hover:text-blue-900"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
