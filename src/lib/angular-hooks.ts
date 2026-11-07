/** The lifecycle hooks Angular calls itself — `ngOnDestroy` on every provided value at teardown — so no spec asked for the call. */
export const ANGULAR_LIFECYCLE_HOOKS: ReadonlySet<PropertyKey> = new Set([
  'ngAfterContentChecked',
  'ngAfterContentInit',
  'ngAfterViewChecked',
  'ngAfterViewInit',
  'ngDoCheck',
  'ngOnChanges',
  'ngOnDestroy',
  'ngOnInit',
]);
