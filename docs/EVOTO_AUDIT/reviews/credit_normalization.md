# Credit normalization — 163/163 reviewed, policy gate BLOCK

All163 frozen workflow rules whose known credit text was shadowed by `creditFreeRequired=NOT_DOCUMENTED` are preserved and classified in [credit_normalization.json](credit_normalization.json). Input SHA256: `280C30AE064B003DBBEF3D0BE05E075E929619F5D322AF946D57D1D8179FA066`. No source review or implementation was edited.

## Counts and meaning

- 36 NO_CREDIT,18 CREDIT_REQUIRED,94 CONDITIONAL,15 UNKNOWN consumption records.
- 20 official source articles;147 usage-rule records and16 administrative/allowance/validity records.
- UNKNOWN is not zero. An allowance, expiry or currency definition is not evidence that an operation is free.
- These163 are source-bound rules, not163 unique features or current verified account terms. Current applicability/account terms remain UNKNOWN for all163 in this conservative overlay.

## Event and scope separation

The JSON preserves generation, export, preview, repeat export, failed-export refund, grants and balance expiry separately. NO_CREDIT applies only to the named event and condition. Online Max-export and AI Lab generation rates are reference-table conditions, not Desktop/Mobile prices. Video vCredits are separate from photo credits. Instant is separate from Evoto Mobile.

Region, plan and platform differences are explicit where documented and UNKNOWN elsewhere. Current Japan color-plan/Instant eligibility conflicts link to CC01/CC04/CC05/CC06/CC07 as applicable. No Desktop-free benefit is inherited onto Mobile.

## Corrections discovered

- CN01: S16030-W016/W017 split one official Spot Healing Brush Tool into two records. Keep provenance, normalize to one operation.
- CN02: S16030-W002 must read Auto Color Corrections as eligible, with Looks/Match/Multi-Image excluded in the old rule. Newer Japan color-plan terms remain separate.
- CN03: Online Toolkit Max-export charge does not itself prove the AI Recognition low-quality-free rule applies to Toolkit.

## Per-record classification

| Frozen fact | Consumption | Events | Rule class | Evidence locator |
| --- | --- | --- | --- | --- |
| S27478-W009 | CONDITIONAL | EXPORT | USAGE_RULE | S27478-H4 "Current Limitations" |
| S26868-W002 | NO_CREDIT | SAMPLE_EXPERIMENT | LIMITED_SAMPLE_OFFER | S26868-H2 "Upload Your Own Test Photos" |
| S26356-W003 | UNKNOWN | SUBSCRIPTION_PURCHASE | CREDIT_ENTITLEMENT | S26356-H3 "Credit Usage" |
| S26356-W005 | UNKNOWN | EXPIRY, CANCELLATION, SUBSCRIPTION_TRANSITION | CREDIT_VALIDITY | S26356-H5 "Validity of Free Trial Credits" |
| S26029-W007 | UNKNOWN | FIRST_LOGIN_GRANT | CREDIT_GRANT | S26029-H10 "Is there a free trial?" |
| S26029-W025 | CONDITIONAL | EXPORT, FAILURE_REFUND | USAGE_RULE | S26029-H32 "What happens if my export fails? Will I be charged?" |
| S25811-W012 | CONDITIONAL | EXPORT | USAGE_RULE | S25811-H7 "vCredit Usage" |
| S25710-W001 | UNKNOWN | UNKNOWN | CURRENCY_INFORMATION | S25710-H1 "What currency does Evoto Video use?" |
| S25710-W002 | CREDIT_REQUIRED | EXPORT | USAGE_RULE | S25710-H2 "How are exports charged?" |
| S25710-W003 | NO_CREDIT | EXPORT | USAGE_RULE | S25710-H2 "How are exports charged?" |
| S25710-W004 | UNKNOWN | FIRST_LOGIN_GRANT | CREDIT_GRANT | S25710-H3 "Do new users get any free credits?" |
| S25710-W005 | NO_CREDIT | EXPORT_FAILURE | USAGE_RULE | S25710-H4 "What happens if my export fails? Will I still be charged?" |
| S25710-W006 | CONDITIONAL | EXPORT | USAGE_RULE | S25710-H5 "If I retry an export, will I be charged again?" |
| S25710-W007 | CONDITIONAL | EXPORT | USAGE_RULE | S25710-H5 "If I retry an export, will I be charged again?" |
| S25710-W008 | NO_CREDIT | EXPORT | USAGE_RULE | S25710-H6 "Are unedited clips charged when exported together with edited clips?" |
| S24771-W002 | CONDITIONAL | EXPORT | USAGE_RULE | S24771-H1 "Product & Workflow" |
| S24771-W003 | UNKNOWN | SIGNUP | CREDIT_GRANT | S24771-H2 "Credits, Storage & Pricing" |
| S24771-W005 | UNKNOWN | BILLING_CYCLE_RESET | CREDIT_VALIDITY | S24771-H2 "Credits, Storage & Pricing" |
| S24771-W006 | UNKNOWN | EXPIRY | CREDIT_VALIDITY | S24771-H2 "Credits, Storage & Pricing" |
| S23185-W003 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W004 | CONDITIONAL | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W005 | UNKNOWN | UNKNOWN | OFFER_CONDITION | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W006 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W007 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W008 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W009 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W010 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W011 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W012 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W013 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W014 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W015 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W016 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W017 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W018 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W019 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W020 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W021 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W022 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W023 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W024 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W025 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W026 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W027 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W028 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W029 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W030 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W031 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W032 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W033 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W034 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W035 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W036 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W037 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W038 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W039 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W040 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W041 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W042 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W043 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W044 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W045 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W046 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W047 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W048 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W049 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W050 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W051 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W052 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W053 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W054 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W055 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W056 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W057 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W058 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W059 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W060 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W061 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W062 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W063 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W064 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W065 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W066 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W067 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W068 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W069 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W070 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W071 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W072 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W073 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W074 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W075 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W076 | NO_CREDIT | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W077 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W078 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W079 | CONDITIONAL | EXPORT | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W080 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W081 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W082 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W083 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W084 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W085 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W086 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W087 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W088 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W089 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W090 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W091 | NO_CREDIT | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W092 | NO_CREDIT | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W093 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W094 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W095 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W096 | NO_CREDIT | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W097 | CREDIT_REQUIRED | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W098 | NO_CREDIT | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S23185-W099 | NO_CREDIT | GENERATION | USAGE_RULE | S23185-H3 "What is the payment structure of Evoto Online?" |
| S21474-W003 | CREDIT_REQUIRED | EXPORT | USAGE_RULE | S21474-H6 "Important Notes" |
| S16030-W001 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H1 "Evoto/ Evoto Instant Version Requirement" |
| S16030-W002 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W003 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W004 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W005 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W006 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W007 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W008 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W009 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W010 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W011 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W012 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W013 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W014 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W015 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W016 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W017 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W018 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W019 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W020 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W021 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W022 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W023 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H2 "Credit-Free Features 2 Overview" |
| S16030-W024 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H3 "Export Credit Rules" |
| S16030-W025 | CONDITIONAL | EXPORT | USAGE_RULE | S16030-H3 "Export Credit Rules" |
| S16030-W026 | CONDITIONAL | EXPORT, REFUND | USAGE_RULE | S16030-H3 "Export Credit Rules" |
| S16030-W027 | NO_CREDIT | EXPORT | USAGE_RULE | S16030-H3 "Export Credit Rules" |
| S14216-W005 | CONDITIONAL | PREVIEW, EXPORT | USAGE_RULE | S14216-H4 "Single-Image AI Editing" |
| S14216-W007 | CONDITIONAL | PREVIEW, EXPORT | USAGE_RULE | S14216-H6 "Credit Usage for AI Editing" |
| S13999-W006 | NO_CREDIT | PREVIEW | USAGE_RULE | S13999-H3 "AI Edited" |
| S13999-W007 | CONDITIONAL | PREVIEW, EXPORT | USAGE_RULE | S13999-H4 "Exported" |
| S13761-W003 | CONDITIONAL | PREVIEW, EXPORT | USAGE_RULE | S13761-H4 "Key Functions of the App" |
| S12010-W002 | CONDITIONAL | EDIT_PREVIEW, TETHER, EXPORT | USAGE_RULE | S12010-H2 "2. What Uses a Credit?" |
| S12010-W003 | CONDITIONAL | EXPORT | USAGE_RULE | S12010-H3 "3. If I Export the Same Image Multiple Times, Am I Charged a Credit Each Time?" |
| S12010-W004 | UNKNOWN | EXPIRY, ROLLOVER | CREDIT_VALIDITY | S12010-H4 "4. Do Credits Expire?" |
| S1673-W014 | CONDITIONAL | EXPORT | USAGE_RULE | S1673-H18 "Additional Notes (Export)" |
| S1079-W014 | NO_CREDIT | REEXPORT | USAGE_RULE | S1079-H8 "Key Considerations" |
| S1245-W002 | UNKNOWN | ROLLOVER | CREDIT_VALIDITY | S1245-H3 "Credit Rollover Feature" |
| S1245-W004 | UNKNOWN | RENEWAL, EXPIRY | CREDIT_VALIDITY | S1245-H5 "Credit Expiration and Renewal" |
| S1242-W002 | UNKNOWN | EXPIRY | CREDIT_VALIDITY | S1242-H1 "Credit Packs & Validity" |
| S1075-W001 | CREDIT_REQUIRED | EXPORT | USAGE_RULE | S1075-H1 "What Are Credits in Evoto?" |
| S1075-W002 | CONDITIONAL | EXPORT | USAGE_RULE | S1075-H2 "Credit Usage Rules" |
| S1075-W005 | UNKNOWN | PROFILE_REWARD | CREDIT_GRANT | S1075-H5 "Managing Your Credits" |
| S1075-W008 | UNKNOWN | DEDUCTION_ORDER | CREDIT_DEDUCTION_ORDER | S1075-H8 "How Are Credits Deducted If I Have Multiple Packages?" |
| S813-W012 | CONDITIONAL | EXPORT | USAGE_RULE | S813-H10 "Slide Show" |
| S813-W040 | NO_CREDIT | EXPORT | USAGE_RULE | S813-H36 "Virtual Copy" |

## Validation boundary

163 unique selected keys,163 normalized records, no omitted selection. Raw credit wording, source URL/date/hash, exact source locator, conditions, rates, units, policy references and unknowns are stored per row. Numeric0 is limited to explicitly free/no-grant cases; missing amounts use UNKNOWN.

Audit/Feature Parity/Mobile Release remain BLOCK. This is billing evidence interpretation only: no spending, account changes, SUITE price/provider choice, formal P0/P1 or implementation.

