/**
 * Thin re-export of the platform's canonical shared-ui-lib SearchableCombobox — kept at this
 * import path so existing call sites (`@/components/ui/combobox`) don't need to change. The
 * previous version of this file was a self-contained, independently-built duplicate of the same
 * component now shipped in shared-ui-lib; the shared one is a superset (adds onRemoteSearch/
 * onLoadMore/hasMore/loading for server-backed pickers) with an identical options/value/onChange/
 * placeholder/searchPlaceholder/emptyText/disabled/clearable/className/footer contract.
 */
export {
  SearchableCombobox as Combobox,
  type SearchableComboboxProps as ComboboxProps,
  type ComboboxOption,
} from '@bengo-hub/shared-ui-lib/combobox';
