// Common data conventions for optional adapter detail controls.
export const booleanRule = { type: "boolean" };
export const detailRule = { type: "enum", values: [0, 1] };
export const detailed = (p) => p.detailVersion === 1;
export const detailOption = {
  key: "detailVersion",
  label: "Model design",
  values: [
    { value: 1, label: "Refined" },
    { value: 0, label: "Original" },
  ],
};
export const choices = (key, label, values, available) => ({
  key,
  label,
  values: values.map(([value, label]) => ({ value, label })),
  available,
});
export const toggle = (key, label, available = detailed) => ({
  key,
  label,
  available,
});
