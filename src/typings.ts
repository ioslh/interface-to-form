export interface FormField {
  prop: string
  type: string  // string, number, union, boolean
  label: string
  desc?: string
  required: boolean
  default?: any
  enumerable?: boolean
  enums?: any[]
}
