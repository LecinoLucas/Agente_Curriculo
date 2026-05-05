import { useState, useMemo } from "react";
import { toast } from "../../../shared/utils/toast";
import { DEFAULT_SKILL_CATEGORIES } from "../utils/skillHelpers";

type NewCategoryFormValues = {
  name: string;
};

const EMPTY_CATEGORY_FORM: NewCategoryFormValues = {
  name: "",
};

export function useCategoryForm() {
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem("skillCategories");
    return saved ? JSON.parse(saved) : [];
  });
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState<NewCategoryFormValues>(EMPTY_CATEGORY_FORM);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const allCategories = useMemo(
    () => [...DEFAULT_SKILL_CATEGORIES, ...customCategories].sort(),
    [customCategories],
  );

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setCategoryError(null);

    if (!categoryForm.name.trim()) {
      setCategoryError("Nome da categoria não pode estar vazio");
      return;
    }

    if (allCategories.includes(categoryForm.name)) {
      setCategoryError("Esta categoria já existe");
      return;
    }

    const updated = [...customCategories, categoryForm.name];
    setCustomCategories(updated);
    localStorage.setItem("skillCategories", JSON.stringify(updated));
    setCategoryForm(EMPTY_CATEGORY_FORM);
    setShowCategoryForm(false);
    toast.success(`Categoria "${categoryForm.name}" adicionada com sucesso`);
  }

  return {
    customCategories,
    showCategoryForm,
    setShowCategoryForm,
    categoryForm,
    setCategoryForm,
    categoryError,
    setCategoryError,
    allCategories,
    handleAddCategory,
  };
}
