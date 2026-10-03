# Workflow normalization — frozen WORKFLOW source facts

458 / 458 の source WORKFLOW facts（42 記事）を各 1 assignment として整理。850 memberships は同じ source fact への複数参照であり、850 機能ではありません。元 workflow.json・他 Evidence・実装・既存検証結果は変更していません。

## 読み方

- `sourceFactKey` が正本への一意参照。platform、credit、batch、RAW/JPEG、preset、sync、processingMethod は JSON の `sourceConditionSnapshot` に元値を保持し、条件を別 workflow や source へ継承しません。
- `SRC-*` は同記事の heading 順、同 heading 内は frozen review fact 順。42 chains はソースの読む順であり、分岐・制約・設定・診断を必ず連続実行する指示ではありません。
- `WFC-*` は同記事・同 workflow の source-order 部分列。256 projections は新機能行でも記事間の依存関係でもありません。
- 全 operation-chain 実機検証は `NOT_VERIFIED`。Windows / macOS / Mobile / Camera / RAW の物理確認は `NOT_RUN`。文書整合の VALID は native PASS ではありません。
- 単なる effect / preset / tag / language sync は Cloud と推定しません。Team は明示 team preset / space / training の文脈のみ。camera/OS permission を Team にしません。
- AI look 学習は AITraining、汎用 AI Edit は Retouch と分離。Generative のラベル管理は生成機能の実行証明ではありません。
- Makeup / Body は最低候補として保持しますが、本 frozen WORKFLOW コホートに固有の該当記録がないため各 0。不在を意味しません。UNKNOWN 0 は全対象をソースに沿って分類できたことのみを示します。

## Coverage

| Item | Count |
| --- | ---: |
| Source facts / assigned / unique | 458 / 458 / 458 |
| Source articles / source-order chains | 42 / 42 |
| Memberships / workflow projections | 850 / 256 |
| Workflow definitions (including UNKNOWN) | 28 |
| New feature rows / verified real-device chains | 0 / 0 |
| Unresolved assignments / validation errors | 0 / 0 |

## Workflow membership counts

各列は重複所属を含む source fact / source article 数。機能数ではありません。

| Workflow | Facts | Articles |
| --- | ---: | ---: |
| Import | 70 | 22 |
| Tether | 11 | 8 |
| Culling | 44 | 11 |
| RAW | 18 | 9 |
| Portrait | 14 | 8 |
| Makeup | 0 | 0 |
| Body | 0 | 0 |
| Background | 7 | 5 |
| Generative | 5 | 3 |
| Batch | 66 | 20 |
| Preset | 51 | 18 |
| Cloud | 34 | 9 |
| Team | 7 | 7 |
| Mobile | 31 | 10 |
| Export | 108 | 22 |
| Print | 6 | 4 |
| Share | 89 | 23 |
| EditorSetup | 59 | 14 |
| Library | 92 | 19 |
| History | 14 | 6 |
| Assets | 16 | 3 |
| AITraining | 22 | 1 |
| Commerce | 19 | 8 |
| Support | 3 | 3 |
| Color | 26 | 12 |
| ExternalEditorRoundtrip | 32 | 6 |
| Retouch | 6 | 5 |
| UNKNOWN | 0 | 0 |

## Source-order assignments (all 458)

以下は同記事の source-order。`workflow:stage` は所属と段階を示します。操作ラベルは短縮ラベルであり、制約の正文は元 source fact と JSON の条件参照に保持されます。

### S27469 — 6 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S27469-W001 | Assistant entry | EditorSetup:ENTRY |
| S27469-W002 | Answer navigation | EditorSetup:NAVIGATE |
| S27469-W003 | Answer feedback | Support:FEEDBACK |
| S27469-W004 | Unified search | Library:SEARCH |
| S27469-W005 | Preset results | Preset:SEARCH; Team:SEARCH |
| S27469-W006 | Navigation safeguards | Import:PREREQUISITE; Library:PREREQUISITE |

### S27468 — 5 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S27468-W001 | Welcome entries | EditorSetup:ENTRY; Library:ENTRY; Import:ENTRY; Tether:ENTRY |
| S27468-W002 | Feature trial source | Import:SELECT |
| S27468-W003 | Quick Start | Culling:ENTRY; Color:ENTRY; Portrait:ENTRY; Background:ENTRY; Generative:ENTRY; EditorSetup:ENTRY |
| S27468-W004 | Recent-project restoration | Library:RESTORE |
| S27468-W005 | Assets and help | Assets:ENTRY; EditorSetup:ENTRY |

### S27467 — 10 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S27467-W001 | Workflow entry | Batch:ENTRY |
| S27467-W002 | Create template | Batch:CREATE |
| S27467-W003 | Workflow stages | Import:CONFIGURE; Culling:CONFIGURE; Preset:CONFIGURE; Export:CONFIGURE; Share:CONFIGURE; Batch:CONFIGURE |
| S27467-W004 | Recommended genres | Batch:SELECT |
| S27467-W005 | Run isolation | Batch:RUN |
| S27467-W006 | Workflow management | Batch:MANAGE |
| S27467-W007 | Import sources | Import:SELECT; ExternalEditorRoundtrip:SELECT |
| S27467-W008 | Export destinations | Export:CONFIGURE; ExternalEditorRoundtrip:CONFIGURE |
| S27467-W009 | Delivery | Share:DELIVER |
| S27467-W010 | Lightroom prerequisite | ExternalEditorRoundtrip:PREREQUISITE; EditorSetup:PREREQUISITE |

### S27345 — 14 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S27345-W001 | Asset types | Assets:OVERVIEW; Preset:OVERVIEW; Color:OVERVIEW; Background:OVERVIEW; Generative:OVERVIEW |
| S27345-W002 | Permission gates | Assets:CONSTRAINT; Export:CONSTRAINT; Preset:CONSTRAINT; Batch:CONSTRAINT; Generative:CONSTRAINT |
| S27345-W003 | Entitlements | Assets:ENTITLEMENT; Commerce:ENTITLEMENT |
| S27345-W004 | Panel entry | Assets:ENTRY; Preset:ENTRY; Color:ENTRY; Background:ENTRY; Generative:ENTRY |
| S27345-W005 | Browse/search | Assets:SEARCH |
| S27345-W006 | Asset details | Assets:REVIEW |
| S27345-W007 | Account sync | Assets:SYNC |
| S27345-W008 | Trial image selection | Assets:SELECT; Import:SELECT; Library:SELECT |
| S27345-W009 | Resume gated action | Assets:RESUME |
| S27345-W010 | Asset retrieval | Assets:RETRIEVE |
| S27345-W011 | Creator application | Assets:SUBMIT; Preset:SUBMIT; Color:SUBMIT; Background:SUBMIT |
| S27345-W012 | Submission fields | Assets:REVIEW |
| S27345-W013 | Delisted asset continuity | Assets:CONSTRAINT; Export:CONSTRAINT |
| S27345-W014 | Sharing prohibition | Assets:CONSTRAINT; Preset:CONSTRAINT; Team:CONSTRAINT; Share:CONSTRAINT |

### S26870 — 5 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S26870-W001 | Download toggle | Share:CONFIGURE; Export:CONFIGURE |
| S26870-W002 | ZIP multi-download | Share:DOWNLOAD; Export:DOWNLOAD; Batch:DOWNLOAD |
| S26870-W003 | Mobile selection | Mobile:SELECT; Export:SELECT |
| S26870-W004 | Mixed paid/free selection | Commerce:UNLOCK; Export:UNLOCK |
| S26870-W005 | Retry partial failures | Export:RETRY |

### S26868 — 4 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S26868-W001 | Sample library | Cloud:DEMO; Import:DEMO; Culling:DEMO; Share:DEMO |
| S26868-W002 | Own test uploads | Import:DEMO; Share:DEMO |
| S26868-W003 | Guided walkthrough | Import:DEMO; Share:DEMO |
| S26868-W004 | Training use | Team:TRAIN |

### S24835 — 22 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S24835-W001 | Training types | AITraining:SELECT; Preset:SELECT |
| S24835-W002 | Lite name | AITraining:CONFIGURE |
| S24835-W003 | Lite sources | AITraining:PREREQUISITE; Preset:PREREQUISITE |
| S24835-W004 | XMP profiles/masks | AITraining:CONFIGURE; Import:CONFIGURE |
| S24835-W005 | Personal basics | AITraining:CONFIGURE |
| S24835-W006 | Training settings | AITraining:CONFIGURE; RAW:CONFIGURE |
| S24835-W007 | Dataset minimum | AITraining:PREREQUISITE; RAW:PREREQUISITE |
| S24835-W008 | RAW sources | AITraining:IMPORT; Import:IMPORT; RAW:IMPORT; ExternalEditorRoundtrip:IMPORT |
| S24835-W009 | RAW+XMP validation | AITraining:VALIDATE; Import:VALIDATE |
| S24835-W010 | Non-RAW sources | AITraining:IMPORT; Import:IMPORT; ExternalEditorRoundtrip:IMPORT |
| S24835-W011 | Both sources | AITraining:IMPORT; Import:IMPORT; ExternalEditorRoundtrip:IMPORT |
| S24835-W012 | LrC filtering | AITraining:SELECT; Import:SELECT; ExternalEditorRoundtrip:SELECT |
| S24835-W013 | Cloud source prerequisite | AITraining:PREREQUISITE; Cloud:PREREQUISITE |
| S24835-W014 | AI Smart Selection | AITraining:SELECT |
| S24835-W015 | Preview limit | AITraining:PREVIEW |
| S24835-W016 | Adjustment modes | AITraining:REFINE; Color:REFINE |
| S24835-W017 | Fine-tuning modules | AITraining:REFINE; Color:REFINE |
| S24835-W018 | Look states | AITraining:MANAGE |
| S24835-W019 | Format matching | AITraining:CONSTRAINT; RAW:CONSTRAINT |
| S24835-W020 | Preset sharing | AITraining:CONSTRAINT; Preset:CONSTRAINT; Share:CONSTRAINT |
| S24835-W021 | Duplicate | AITraining:DUPLICATE |
| S24835-W022 | Training task control | AITraining:MANAGE |

### S24768 — 6 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S24768-W001 | Activity dashboard | Share:REVIEW |
| S24768-W002 | Live slideshow | Share:CONFIGURE |
| S24768-W003 | Batch rename | Batch:RENAME; Library:RENAME |
| S24768-W004 | Manual QR scan | Mobile:SCAN; Share:SCAN |
| S24768-W005 | Watermark kinds | Share:CONFIGURE; Commerce:CONFIGURE |
| S24768-W006 | Responsive banners | Share:CONFIGURE; Mobile:CONFIGURE |

### S24543 — 2 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S24543-W001 | Mobile language | Mobile:CONFIGURE; EditorSetup:CONFIGURE |
| S24543-W002 | Web language | EditorSetup:CONFIGURE |

### S23968 — 9 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S23968-W001 | School mode | Share:PREREQUISITE; Library:PREREQUISITE |
| S23968-W002 | Roster import | Import:VALIDATE; Library:VALIDATE |
| S23968-W003 | Roster correction | Library:MANAGE |
| S23968-W004 | QR cards | Share:EXPORT |
| S23968-W005 | Mobile AI grouping | Mobile:GROUP; Tether:GROUP; Import:GROUP; Library:GROUP |
| S23968-W006 | Manual grouping | Mobile:GROUP; Tether:GROUP; Library:GROUP |
| S23968-W007 | Post-shoot grouping | Import:REVIEW; Library:REVIEW; RAW:REVIEW; Mobile:REVIEW |
| S23968-W008 | Privacy/access | Share:CONFIGURE |
| S23968-W009 | Bulk delivery email | Share:DELIVER; Batch:DELIVER |

### S23695 — 7 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S23695-W001 | School preparation | Library:PREPARE; Import:PREPARE; Print:PREPARE; Share:PREPARE |
| S23695-W002 | Configure workflow | Preset:CONFIGURE; Share:CONFIGURE; Commerce:CONFIGURE |
| S23695-W003 | Optional culling | Mobile:CONFIGURE; Culling:CONFIGURE |
| S23695-W004 | Tether sorting | Tether:CAPTURE; Mobile:CAPTURE; Library:CAPTURE |
| S23695-W005 | SD workflow | Import:IMPORT; Mobile:IMPORT; Library:IMPORT; Preset:IMPORT |
| S23695-W006 | Review/delivery | Library:DELIVER; Batch:DELIVER; Share:DELIVER |
| S23695-W007 | Purchase delivery | Commerce:DOWNLOAD; Export:DOWNLOAD |

### S21291 — 13 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S21291-W001 | Store setup | Commerce:ENTRY |
| S21291-W002 | Payout integration | Commerce:PREREQUISITE |
| S21291-W003 | Per-photo price | Commerce:CONFIGURE; Export:CONFIGURE |
| S21291-W004 | Free plus paid | Commerce:CONFIGURE; Export:CONFIGURE |
| S21291-W005 | Whole-gallery unlock | Commerce:CONFIGURE; Export:CONFIGURE |
| S21291-W006 | Tips | Commerce:CONFIGURE |
| S21291-W007 | Protection overlay | Share:CONFIGURE; Commerce:CONFIGURE |
| S21291-W008 | Delivery security | Share:DELIVER; Export:DELIVER; Commerce:DELIVER |
| S21291-W009 | Retention/deletion | Library:CONSTRAINT; Share:CONSTRAINT; Export:CONSTRAINT |
| S21291-W010 | Region/fees | Commerce:CONSTRAINT |
| S21291-W011 | Payout schedule | Commerce:WITHDRAW |
| S21291-W012 | Project analytics | Share:ANALYZE |
| S21291-W013 | Revenue analytics | Commerce:ANALYZE |

### S12956 — 11 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S12956-W001 | Source selection | Batch:SELECT |
| S12956-W002 | Target selection | Batch:SELECT |
| S12956-W003 | Selective sync | Batch:CONFIGURE; Color:CONFIGURE; Portrait:CONFIGURE; Background:CONFIGURE |
| S12956-W004 | Sync execution | Batch:APPLY |
| S12956-W005 | Prompt frequency | Batch:CONFIGURE; EditorSetup:CONFIGURE |
| S12956-W006 | Save preset | Preset:CREATE |
| S12956-W007 | Apply preset | Preset:APPLY; Batch:APPLY |
| S12956-W008 | Usage scope | Batch:OVERVIEW; Preset:OVERVIEW |
| S12956-W009 | Subject color sync exclusion | Batch:CONSTRAINT; Color:CONSTRAINT |
| S12956-W010 | Identity-bound portrait sync | Batch:CONSTRAINT; Portrait:CONSTRAINT |
| S12956-W011 | Selective overwrite caution | Batch:CONSTRAINT |

### S13367 — 23 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S13367-W001 | Project-only culling | Culling:ENTRY; Library:ENTRY |
| S13367-W002 | Story modes | Culling:CONFIGURE; Library:CONFIGURE |
| S13367-W003 | Segment management | Culling:ORGANIZE; Library:ORGANIZE |
| S13367-W004 | Segment filtering | Culling:FILTER; Library:FILTER |
| S13367-W005 | Segment delivery | Culling:DELIVER; Export:DELIVER; Share:DELIVER; Cloud:DELIVER |
| S13367-W006 | Metadata review | Library:REVIEW |
| S13367-W007 | Filter groups | Culling:FILTER |
| S13367-W008 | Face Focus | Culling:REVIEW |
| S13367-W009 | Face scores | Culling:REVIEW |
| S13367-W010 | Perfect Shot modes | Culling:EDIT; Portrait:EDIT |
| S13367-W011 | Perfect Shot scope/output | Culling:CONSTRAINT; Portrait:CONSTRAINT; Library:CONSTRAINT |
| S13367-W012 | Clusters | Culling:GROUP |
| S13367-W013 | Semantic search | Culling:SEARCH; Library:SEARCH |
| S13367-W014 | Custom tags | Culling:TAG; Library:TAG; Batch:TAG |
| S13367-W015 | Smart analysis lifecycle | Culling:ANALYZE; Import:ANALYZE |
| S13367-W016 | Start modes | Culling:CONFIGURE |
| S13367-W017 | Event type | Culling:CONFIGURE |
| S13367-W018 | Total/per-cluster limits | Culling:CONFIGURE |
| S13367-W019 | Auto marks | Culling:MARK; Library:MARK |
| S13367-W020 | Save tags locally | Culling:EXPORT; Library:EXPORT |
| S13367-W021 | Analysis sensitivity | Culling:CONFIGURE |
| S13367-W022 | Result review | Culling:REVIEW; Library:REVIEW |
| S13367-W023 | During-cull exclusions | Culling:CONSTRAINT; Import:CONSTRAINT; Tether:CONSTRAINT; Library:CONSTRAINT |

### S13365 — 16 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S13365-W001 | Platform restriction | Cloud:CONSTRAINT |
| S13365-W002 | Cloud operations | Cloud:OVERVIEW; Team:OVERVIEW |
| S13365-W003 | Default space | Cloud:SELECT |
| S13365-W004 | Cloud upload | Cloud:UPLOAD |
| S13365-W005 | Download controls | Cloud:DOWNLOAD; Batch:DOWNLOAD |
| S13365-W006 | Smart preview policy | Cloud:CONSTRAINT; RAW:CONSTRAINT |
| S13365-W007 | Export original fetch | Cloud:DOWNLOAD; Export:DOWNLOAD |
| S13365-W008 | Reload recovery | Cloud:RECOVER; Support:RECOVER |
| S13365-W009 | Transfers | Cloud:MANAGE |
| S13365-W010 | History/assets sync | Cloud:SYNC; History:SYNC; Assets:SYNC |
| S13365-W011 | Version compatibility | Cloud:CONSTRAINT; Preset:CONSTRAINT |
| S13365-W012 | Account capacity | Cloud:REVIEW |
| S13365-W013 | Per-space capacity | Cloud:REVIEW |
| S13365-W014 | Grace policy | Cloud:CONSTRAINT |
| S13365-W015 | Local-copy removal | Cloud:REMOVE_LOCAL_COPY; Library:REMOVE_LOCAL_COPY |
| S13365-W016 | Cloud-only deletion | Cloud:DELETE; Library:DELETE |

### S14348 — 5 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S14348-W001 | Domain settings | Share:ENTRY |
| S14348-W002 | Standard domain | Share:CONFIGURE |
| S14348-W003 | White label | Share:CONSTRAINT |
| S14348-W004 | Custom subdomain | Share:CONSTRAINT |
| S14348-W005 | Link propagation | Share:DELIVER |

### S14326 — 6 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S14326-W001 | Cloud watermark settings | Cloud:ENTRY; Share:ENTRY |
| S14326-W002 | Upload/manage | Cloud:MANAGE; Share:MANAGE |
| S14326-W003 | Placement | Cloud:CONFIGURE; Share:CONFIGURE |
| S14326-W004 | Appearance | Cloud:CONFIGURE; Share:CONFIGURE |
| S14326-W005 | Aspect previews | Cloud:PREVIEW; Share:PREVIEW |
| S14326-W006 | Limits | Cloud:CONSTRAINT; Share:CONSTRAINT |

### S14302 — 12 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S14302-W001 | Branding entry | Cloud:ENTRY; Share:ENTRY |
| S14302-W002 | Favorites/notes | Share:CONFIGURE |
| S14302-W003 | Default sorting | Share:CONFIGURE |
| S14302-W004 | Slideshow | Share:CONFIGURE |
| S14302-W005 | Top banner | Share:CONFIGURE; Mobile:CONFIGURE |
| S14302-W006 | Bottom banner | Share:CONFIGURE |
| S14302-W007 | Watermark roles | Share:CONFIGURE; Commerce:CONFIGURE |
| S14302-W008 | Photographer cards | Share:CONFIGURE |
| S14302-W009 | Plan eligibility | Share:CONSTRAINT |
| S14302-W010 | Branding sync | Share:SYNC; Mobile:SYNC |
| S14302-W011 | Visitor controls | Share:CONFIGURE; Export:CONFIGURE |
| S14302-W012 | Multi-download | Share:DOWNLOAD; Export:DOWNLOAD; Batch:DOWNLOAD; Mobile:DOWNLOAD |

### S14285 — 9 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S14285-W001 | Classic access | Share:CONFIGURE |
| S14285-W002 | Personal-only mode | Share:CONFIGURE |
| S14285-W003 | Roster mode | Share:CONFIGURE |
| S14285-W004 | FaceKey scopes | Share:CONSTRAINT |
| S14285-W005 | Refresh | Share:REFRESH |
| S14285-W006 | Guest display | Share:REVIEW |
| S14285-W007 | Social share | Share:DELIVER |
| S14285-W008 | FaceKey vs Personal | Share:CONSTRAINT |
| S14285-W009 | Participant QR | Share:EXPORT |

### S14251 — 7 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S14251-W001 | Photo metadata | Library:REVIEW |
| S14251-W002 | Face sharing | Share:GROUP |
| S14251-W003 | Before/after | Library:COMPARE |
| S14251-W004 | Delete | Library:DELETE |
| S14251-W005 | Pin | Library:PIN; Share:PIN |
| S14251-W006 | Processing stage | Library:NAVIGATE; Export:NAVIGATE; Share:NAVIGATE |
| S14251-W007 | Single AI edit | Retouch:EDIT |

### S14110 — 10 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S14110-W001 | Enable | Culling:CONFIGURE; Import:CONFIGURE |
| S14110-W002 | Apply rules | Culling:CONFIGURE |
| S14110-W003 | Closed eyes | Culling:CONFIGURE |
| S14110-W004 | Blur | Culling:CONFIGURE |
| S14110-W005 | Underexposure | Culling:CONFIGURE |
| S14110-W006 | Overexposure | Culling:CONFIGURE |
| S14110-W007 | Duplicates | Culling:GROUP |
| S14110-W008 | Sensitivity | Culling:CONFIGURE |
| S14110-W009 | Upload choice | Culling:UPLOAD; Import:UPLOAD |
| S14110-W010 | Review flow | Culling:REVIEW; Import:REVIEW |

### S14057 — 9 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S14057-W001 | Access | Share:CONFIGURE |
| S14057-W002 | FaceKey | Share:SEARCH |
| S14057-W003 | Interact | Share:CREATE |
| S14057-W004 | Full gallery | Share:DELIVER |
| S14057-W005 | Personal delivery | Share:DELIVER |
| S14057-W006 | Branding | Share:CONFIGURE |
| S14057-W007 | Settings/distribution separation | Share:OVERVIEW |
| S14057-W008 | Gallery types | Share:CONFIGURE |
| S14057-W009 | ZIP download | Share:DOWNLOAD; Export:DOWNLOAD; Batch:DOWNLOAD; Mobile:DOWNLOAD |

### S14040 — 6 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S14040-W001 | Project limits/sync | Cloud:CONSTRAINT; Library:CONSTRAINT |
| S14040-W002 | Project list | Library:REVIEW |
| S14040-W003 | Permanent project delete | Cloud:DELETE; Library:DELETE; Share:DELETE |
| S14040-W004 | Clear cache risk | Cloud:CONSTRAINT; Library:CONSTRAINT |
| S14040-W005 | Project configuration | Library:CONFIGURE; Preset:CONFIGURE; Share:CONFIGURE; Commerce:CONFIGURE |
| S14040-W006 | Settings shortcuts | Library:ENTRY; Retouch:ENTRY; Culling:ENTRY; Import:ENTRY; Share:ENTRY |

### S13999 — 9 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S13999-W001 | Pipeline stages | Mobile:OVERVIEW; Import:OVERVIEW; Cloud:OVERVIEW; Retouch:OVERVIEW; Export:OVERVIEW; Share:OVERVIEW |
| S13999-W002 | Camera import | Mobile:IMPORT; Tether:IMPORT; Import:IMPORT |
| S13999-W003 | SD import | Mobile:IMPORT; Import:IMPORT |
| S13999-W004 | Phone import | Mobile:IMPORT; Import:IMPORT |
| S13999-W005 | Upload policy | Mobile:UPLOAD; Cloud:UPLOAD; Culling:UPLOAD |
| S13999-W006 | AI stage | Cloud:PREVIEW; Retouch:PREVIEW |
| S13999-W007 | Export stage | Mobile:EXPORT; Export:EXPORT |
| S13999-W008 | Share stage | Share:DELIVER |
| S13999-W009 | Offline AI pending | Mobile:CONSTRAINT; Cloud:CONSTRAINT |

### S13982 — 5 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S13982-W001 | Web creation | Library:CREATE |
| S13982-W002 | Rename photos | Batch:RENAME; Library:RENAME |
| S13982-W003 | Web project configuration | Library:CONFIGURE; Preset:CONFIGURE; Export:CONFIGURE; Share:CONFIGURE; Commerce:CONFIGURE; Mobile:CONFIGURE |
| S13982-W004 | App creation | Mobile:CREATE; Library:CREATE; Culling:CREATE; Preset:CREATE; Export:CREATE |
| S13982-W005 | Settings bar | Library:ENTRY; Retouch:ENTRY; Culling:ENTRY; Import:ENTRY; Share:ENTRY |

### S13662 — 8 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S13662-W001 | Account/login | Mobile:PREREQUISITE; EditorSetup:PREREQUISITE |
| S13662-W002 | Project | Mobile:CREATE; Library:CREATE; Culling:CREATE; Preset:CREATE; Export:CREATE; Share:CREATE |
| S13662-W003 | Wired tether | Mobile:CONNECT; Tether:CONNECT |
| S13662-W004 | FTP tether | Mobile:CONNECT; Tether:CONNECT |
| S13662-W005 | Automatic processing | Mobile:PROCESS; Culling:PROCESS; Preset:PROCESS; Retouch:PROCESS |
| S13662-W006 | Branding | Mobile:CONFIGURE; Share:CONFIGURE |
| S13662-W007 | Delivery | Mobile:DELIVER; Share:DELIVER |
| S13662-W008 | Sample workflow | Mobile:DEMO; Import:DEMO; Share:DEMO |

### S1760 — 6 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S1760-W001 | Watched folders | Import:CONFIGURE; Batch:CONFIGURE |
| S1760-W002 | Import options | Import:CONFIGURE; RAW:CONFIGURE; Preset:CONFIGURE; Batch:CONFIGURE |
| S1760-W003 | Destination isolation | Import:CONSTRAINT; Export:CONSTRAINT; Batch:CONSTRAINT |
| S1760-W004 | Folder structure | Export:CONFIGURE; Batch:CONFIGURE |
| S1760-W005 | Interval | Export:CONFIGURE; Batch:CONFIGURE |
| S1760-W006 | Export options | Export:RUN; Batch:RUN |

### S1751 — 7 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S1751-W001 | Original format | RAW:CONSTRAINT; Export:CONSTRAINT |
| S1751-W002 | Export formats | Export:CONFIGURE |
| S1751-W003 | JPEG quality | Export:CONFIGURE |
| S1751-W004 | Target size | Export:CONSTRAINT |
| S1751-W005 | Output sharpening | Export:CONFIGURE; Print:CONFIGURE |
| S1751-W006 | Crop resolution | Export:CONFIGURE |
| S1751-W007 | Resize | Export:CONFIGURE |

### S1736 — 7 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S1736-W001 | General history | History:RESTORE |
| S1736-W002 | Grouped tool session | History:CONSTRAINT |
| S1736-W003 | Recent persistent history | History:RESTORE |
| S1736-W004 | Tool history | History:RESTORE |
| S1736-W005 | Global undo | History:UNDO; Batch:UNDO; Library:UNDO |
| S1736-W006 | Batch undo | History:UNDO; Batch:UNDO |
| S1736-W007 | Global exclusions | History:CONSTRAINT |

### S1726 — 6 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S1726-W001 | Interchange | Preset:OVERVIEW; Color:OVERVIEW |
| S1726-W002 | Import entry | Preset:ENTRY |
| S1726-W003 | XMP import | Preset:IMPORT |
| S1726-W004 | LUT/profile import | Preset:IMPORT; Color:IMPORT |
| S1726-W005 | Missing profile | Preset:IMPORT; Color:IMPORT |
| S1726-W006 | Compatibility reason | Preset:CONSTRAINT; Color:CONSTRAINT |

### S1722 — 7 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S1722-W001 | Preview acceleration | EditorSetup:CONFIGURE; Portrait:CONFIGURE; Color:CONFIGURE |
| S1722-W002 | Export acceleration | EditorSetup:CONFIGURE; Portrait:CONFIGURE; Export:CONFIGURE |
| S1722-W003 | Group speed | EditorSetup:CONFIGURE; Portrait:CONFIGURE |
| S1722-W004 | Memory controls | EditorSetup:CONFIGURE; Export:CONFIGURE |
| S1722-W005 | Preview resolution | EditorSetup:CONFIGURE |
| S1722-W006 | Thumbnail content | EditorSetup:CONFIGURE |
| S1722-W007 | Adjacent preload | EditorSetup:CONFIGURE |

### S1673 — 18 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S1673-W001 | Project/activity constraints | Import:CONSTRAINT; Tether:CONSTRAINT; Export:CONSTRAINT; Batch:CONSTRAINT |
| S1673-W002 | Editing lock | Export:CONSTRAINT; Batch:CONSTRAINT |
| S1673-W003 | New-project entry | Import:ENTRY; Export:ENTRY; Batch:ENTRY |
| S1673-W004 | Preview entry | Import:ENTRY; Export:ENTRY; Batch:ENTRY |
| S1673-W005 | Watch limit | Import:CONFIGURE; Batch:CONFIGURE |
| S1673-W006 | Formats | Import:CONFIGURE; RAW:CONFIGURE; Batch:CONFIGURE |
| S1673-W007 | Preset | Import:CONFIGURE; Preset:CONFIGURE; Batch:CONFIGURE |
| S1673-W008 | Selection behavior | Import:CONFIGURE; Library:CONFIGURE |
| S1673-W009 | Start import | Import:RUN; Batch:RUN |
| S1673-W010 | Import settings lock | Import:CONSTRAINT; Batch:CONSTRAINT |
| S1673-W011 | Resume detection | Import:RESUME; Batch:RESUME |
| S1673-W012 | Export interval | Export:CONFIGURE; Batch:CONFIGURE |
| S1673-W013 | Export options | Export:CONFIGURE; Preset:CONFIGURE; Batch:CONFIGURE |
| S1673-W014 | Previously not auto-exported | Export:CONSTRAINT; RAW:CONSTRAINT; Batch:CONSTRAINT |
| S1673-W015 | Preset changes | Preset:RESUME; Batch:RESUME |
| S1673-W016 | Progress | Import:MANAGE; Export:MANAGE; Batch:MANAGE |
| S1673-W017 | Tether automation | Tether:OVERVIEW; Import:OVERVIEW; Preset:OVERVIEW; Export:OVERVIEW; Batch:OVERVIEW |
| S1673-W018 | RAW+JPEG duplication | Import:CONSTRAINT; RAW:CONSTRAINT; Export:CONSTRAINT; Batch:CONSTRAINT |

### S1633 — 3 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S1633-W001 | Send to Evoto | Import:IMPORT; ExternalEditorRoundtrip:IMPORT |
| S1633-W002 | Return export settings | Export:CONFIGURE; ExternalEditorRoundtrip:CONFIGURE |
| S1633-W003 | Refresh Lightroom | ExternalEditorRoundtrip:REFRESH |

### S1079 — 14 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S1079-W001 | Single-image roundtrip | Import:OVERVIEW; Export:OVERVIEW; ExternalEditorRoundtrip:OVERVIEW |
| S1079-W002 | Catalog preparation | ExternalEditorRoundtrip:PREPARE |
| S1079-W003 | Catalog import | Import:IMPORT; ExternalEditorRoundtrip:IMPORT |
| S1079-W004 | Import settings | Import:CONFIGURE; Color:CONFIGURE; ExternalEditorRoundtrip:CONFIGURE |
| S1079-W005 | Unsupported transfer | Import:CONSTRAINT; ExternalEditorRoundtrip:CONSTRAINT |
| S1079-W006 | Batch edit | Batch:EDIT; Preset:EDIT; ExternalEditorRoundtrip:EDIT |
| S1079-W007 | Catalog export | Export:EXPORT; ExternalEditorRoundtrip:EXPORT |
| S1079-W008 | Merge original | Export:CONFIGURE; Color:CONFIGURE; RAW:CONFIGURE; ExternalEditorRoundtrip:CONFIGURE |
| S1079-W009 | New catalog | Export:CONFIGURE; Color:CONFIGURE; ExternalEditorRoundtrip:CONFIGURE |
| S1079-W010 | Output destinations | Export:CONFIGURE; ExternalEditorRoundtrip:CONFIGURE |
| S1079-W011 | Non-RAW backup | Export:CONSTRAINT; RAW:CONSTRAINT; ExternalEditorRoundtrip:CONSTRAINT |
| S1079-W012 | Lightroom refresh | ExternalEditorRoundtrip:REFRESH |
| S1079-W013 | RAW limitation | RAW:CONSTRAINT; Export:CONSTRAINT; ExternalEditorRoundtrip:CONSTRAINT |
| S1079-W014 | Repeat editing | Export:REEDIT; History:REEDIT; ExternalEditorRoundtrip:REEDIT |

### S600 — 51 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S600-W001 | Import limits | Import:CONSTRAINT; RAW:CONSTRAINT |
| S600-W002 | Batch limit | Import:CONSTRAINT; Batch:CONSTRAINT |
| S600-W003 | Library import | Import:IMPORT; Library:IMPORT |
| S600-W004 | Catalog import | Import:IMPORT; ExternalEditorRoundtrip:IMPORT |
| S600-W005 | Catalog settings fidelity | Import:CONSTRAINT; Color:CONSTRAINT; ExternalEditorRoundtrip:CONSTRAINT |
| S600-W006 | Edit import | Import:IMPORT |
| S600-W007 | External entry | Import:IMPORT |
| S600-W008 | Export commands | Export:ENTRY; ExternalEditorRoundtrip:ENTRY |
| S600-W009 | Export layout | Export:ENTRY |
| S600-W010 | Output count | Export:CONSTRAINT; Batch:CONSTRAINT |
| S600-W011 | Save export preset | Export:CREATE; Preset:CREATE |
| S600-W012 | Multi-preset export | Export:EXPORT; Preset:EXPORT; Batch:EXPORT |
| S600-W013 | Export effect variants | Export:CONFIGURE; Preset:CONFIGURE |
| S600-W014 | Destination | Export:CONFIGURE |
| S600-W015 | Collision handling | Export:CONSTRAINT |
| S600-W016 | Instant sync consent | Export:CONSENT; Share:CONSENT |
| S600-W017 | Original Filename | Export:CONFIGURE |
| S600-W018 | Custom Filename (# of #) | Export:CONFIGURE |
| S600-W019 | Capture Date + Original Filename | Export:CONFIGURE |
| S600-W020 | Custom Filename + Sequence | Export:CONFIGURE |
| S600-W021 | Original Filename + Custom Text | Export:CONFIGURE |
| S600-W022 | Original Filename + Preset Name | Export:CONFIGURE |
| S600-W023 | Original Filename + Export Preset | Export:CONFIGURE |
| S600-W024 | Original Filename + Preset Name + Export Preset | Export:CONFIGURE |
| S600-W025 | Original Filename + Preset Name + Custom Text | Export:CONFIGURE |
| S600-W026 | Percentage | Export:CONFIGURE |
| S600-W027 | Width & Height / Dimensions | Export:CONFIGURE |
| S600-W028 | Long Edge | Export:CONFIGURE |
| S600-W029 | Short Edge | Export:CONFIGURE |
| S600-W030 | Resolution units | Export:CONFIGURE |
| S600-W031 | Output formats | Export:CONFIGURE; RAW:CONFIGURE |
| S600-W032 | JPEG quality | Export:CONFIGURE |
| S600-W033 | Sharpening None | Export:CONFIGURE |
| S600-W034 | Sharpening Screen Low | Export:CONFIGURE |
| S600-W035 | Sharpening Screen Standard | Export:CONFIGURE |
| S600-W036 | Sharpening Screen High | Export:CONFIGURE |
| S600-W037 | Sharpening Print Low | Export:CONFIGURE; Print:CONFIGURE |
| S600-W038 | Sharpening Print Standard | Export:CONFIGURE; Print:CONFIGURE |
| S600-W039 | Sharpening Print High | Export:CONFIGURE; Print:CONFIGURE |
| S600-W040 | Watermark Rotation | Export:CONFIGURE |
| S600-W041 | Watermark Size | Export:CONFIGURE |
| S600-W042 | Watermark Opacity | Export:CONFIGURE |
| S600-W043 | Watermark Position | Export:CONFIGURE |
| S600-W044 | Catalog prerequisite | Export:PREREQUISITE; ExternalEditorRoundtrip:PREREQUISITE |
| S600-W045 | Catalog destinations | Export:CONFIGURE; ExternalEditorRoundtrip:CONFIGURE |
| S600-W046 | Non-RAW replacement | Export:CONFIGURE; RAW:CONFIGURE; ExternalEditorRoundtrip:CONFIGURE |
| S600-W047 | Color parameter synchronization | Import:CONFIGURE; Export:CONFIGURE; Color:CONFIGURE; ExternalEditorRoundtrip:CONFIGURE |
| S600-W048 | Preview | Import:CONSTRAINT; EditorSetup:CONSTRAINT |
| S600-W049 | Byte-size changes | Export:CONSTRAINT |
| S600-W050 | Write permissions | Export:PREREQUISITE |
| S600-W051 | Error reporting | Export:REPORT; Support:REPORT |

### S599 — 2 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S599-W001 | Language selection | EditorSetup:CONFIGURE |
| S599-W002 | Arabic | EditorSetup:CONFIGURE |

### S598 — 21 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S598-W001 | Preview acceleration | EditorSetup:CONFIGURE; Portrait:CONFIGURE; Color:CONFIGURE |
| S598-W002 | Export acceleration | EditorSetup:CONFIGURE; Portrait:CONFIGURE; Export:CONFIGURE |
| S598-W003 | Group portrait optimization | EditorSetup:CONFIGURE; Portrait:CONFIGURE |
| S598-W004 | Memory settings | EditorSetup:CONFIGURE; Export:CONFIGURE |
| S598-W005 | Request timeout | EditorSetup:CONFIGURE |
| S598-W006 | Export concurrency | EditorSetup:CONFIGURE; Export:CONFIGURE; Batch:CONFIGURE |
| S598-W007 | Caption metadata | EditorSetup:CONFIGURE; Library:CONFIGURE |
| S598-W008 | Cache expiration | EditorSetup:CONFIGURE; Library:CONFIGURE |
| S598-W009 | Manual cache clear | EditorSetup:CONSTRAINT; History:CONSTRAINT |
| S598-W010 | Expand storage | EditorSetup:CONFIGURE; Batch:CONFIGURE |
| S598-W011 | Import wait | EditorSetup:CONFIGURE; Import:CONFIGURE |
| S598-W012 | JPEG/PNG integrity | EditorSetup:VALIDATE; Import:VALIDATE |
| S598-W013 | Preview color space | EditorSetup:CONFIGURE; Color:CONFIGURE |
| S598-W014 | Preview size override | EditorSetup:CONFIGURE; Color:CONFIGURE |
| S598-W015 | Effect preloading | EditorSetup:CONFIGURE |
| S598-W016 | Preview position/scale | EditorSetup:CONFIGURE |
| S598-W017 | Usage-data control | EditorSetup:CONFIGURE |
| S598-W018 | Content analysis | EditorSetup:CONFIGURE |
| S598-W019 | Sync prompt | EditorSetup:CONFIGURE; Batch:CONFIGURE |
| S598-W020 | Auto-connect tether | EditorSetup:CONFIGURE; Tether:CONFIGURE |
| S598-W021 | Auto Switch to Edit | EditorSetup:CONFIGURE; Import:CONFIGURE |

### S597 — 3 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S597-W001 | Shortcut list | EditorSetup:ENTRY |
| S597-W002 | Custom shortcuts | EditorSetup:CONFIGURE |
| S597-W003 | Access setting | EditorSetup:CONSTRAINT |

### S596 — 12 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S596-W001 | Libraries | Preset:SELECT; Team:SELECT |
| S596-W002 | Apply | Preset:APPLY |
| S596-W003 | Create | Preset:CREATE |
| S596-W004 | Groups | Preset:ORGANIZE |
| S596-W005 | Sorting | Preset:ORGANIZE |
| S596-W006 | Context actions | Preset:MANAGE; Share:MANAGE |
| S596-W007 | Import sources | Preset:IMPORT |
| S596-W008 | File semantics | Preset:IMPORT; Color:IMPORT |
| S596-W009 | Missing profile | Preset:IMPORT; Color:IMPORT |
| S596-W010 | Preset types | Preset:SELECT; Portrait:SELECT; Color:SELECT |
| S596-W011 | Custom tokens | Preset:SHARE; Share:SHARE |
| S596-W012 | Immutable token snapshot | Preset:CONSTRAINT; Share:CONSTRAINT |

### S595 — 3 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S595-W001 | Sync all | Batch:APPLY |
| S595-W002 | Copy/paste | Batch:APPLY |
| S595-W003 | Prompt frequency | Batch:CONFIGURE; EditorSetup:CONFIGURE |

### S1383 — 13 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S1383-W001 | Toolbar | EditorSetup:ENTRY; Library:ENTRY; Import:ENTRY; History:ENTRY |
| S1383-W002 | Floating widget | Preset:ENTRY; Team:ENTRY; History:ENTRY |
| S1383-W003 | Before/after | EditorSetup:COMPARE |
| S1383-W004 | Canvas colors | EditorSetup:CONFIGURE |
| S1383-W005 | Filmstrip filters | Library:FILTER |
| S1383-W006 | Filmstrip resizing | EditorSetup:CONSTRAINT; Library:CONSTRAINT |
| S1383-W007 | Parameter input | EditorSetup:EDIT |
| S1383-W008 | Panel organization | EditorSetup:ORGANIZE |
| S1383-W009 | Group comparison | EditorSetup:COMPARE |
| S1383-W010 | Single-effect comparison | EditorSetup:COMPARE |
| S1383-W011 | Modules | Color:ENTRY; Portrait:ENTRY; Background:ENTRY; EditorSetup:ENTRY |
| S1383-W012 | Favorites granularity | EditorSetup:SELECT |
| S1383-W013 | Favorites behavior | EditorSetup:CONSTRAINT |

### S813 — 46 records

| Source fact | Documented operation | Workflow:stage |
| --- | --- | --- |
| S813-W001 | Toolbar | EditorSetup:ENTRY; Library:ENTRY; Import:ENTRY; Export:ENTRY; History:ENTRY |
| S813-W002 | Project search | Library:SEARCH |
| S813-W003 | Management panel | Cloud:ENTRY; Library:ENTRY |
| S813-W004 | Filmstrip controls | Library:REVIEW |
| S813-W005 | Culling | Culling:ENTRY |
| S813-W006 | Preset libraries | Preset:SELECT; Team:SELECT |
| S813-W007 | Sync categories | Batch:CONFIGURE; Color:CONFIGURE; Portrait:CONFIGURE; Background:CONFIGURE |
| S813-W008 | Metadata | Library:EDIT; Batch:EDIT |
| S813-W009 | Slideshow music | Share:CONFIGURE |
| S813-W010 | Slideshow backdrop | Share:CONFIGURE |
| S813-W011 | Intro slide | Share:CONFIGURE |
| S813-W012 | Slideshow output | Share:EXPORT; Export:EXPORT |
| S813-W013 | Preview watermark | EditorSetup:CONSTRAINT |
| S813-W014 | Import | Import:IMPORT; ExternalEditorRoundtrip:IMPORT |
| S813-W015 | Groups entry | Library:ENTRY |
| S813-W016 | Create group | Library:CREATE |
| S813-W017 | Group project | Library:CREATE |
| S813-W018 | Group actions | Library:MANAGE |
| S813-W019 | Group order | Library:ORGANIZE |
| S813-W020 | Related folder actions | Library:IMPORT; Import:IMPORT |
| S813-W021 | Folder delete scopes | Library:DELETE |
| S813-W022 | Lost folders | Library:RESTORE |
| S813-W023 | Folder refresh | Library:REFRESH; Import:REFRESH |
| S813-W024 | Collections | Library:ORGANIZE; Export:ORGANIZE |
| S813-W025 | Grid | Library:EDIT; Batch:EDIT; Preset:EDIT |
| S813-W026 | Loupe | Library:REVIEW |
| S813-W027 | Survey | Library:COMPARE |
| S813-W028 | Canvas background | EditorSetup:CONFIGURE |
| S813-W029 | Selection/navigation | Library:SELECT |
| S813-W030 | Color labels | Library:MARK |
| S813-W031 | Flags/stars | Library:MARK; Batch:MARK |
| S813-W032 | Generated marker | Library:FILTER; Generative:FILTER |
| S813-W033 | Filter menu | Library:FILTER |
| S813-W034 | Move behavior | Library:MOVE |
| S813-W035 | Cross-project copy | Library:COPY |
| S813-W036 | Photo context | Library:MANAGE |
| S813-W037 | Photo delete | Library:DELETE |
| S813-W038 | Create virtual copy | Library:CREATE; Batch:CREATE |
| S813-W039 | Virtual copy state | Library:CONSTRAINT; History:CONSTRAINT |
| S813-W040 | Virtual copy lifecycle | Library:CONSTRAINT; Culling:CONSTRAINT; Export:CONSTRAINT |
| S813-W041 | Protected paths | Library:CONSTRAINT |
| S813-W042 | Missing files | Library:CONSTRAINT; RAW:CONSTRAINT |
| S813-W043 | Permissions | Library:CONSTRAINT |
| S813-W044 | Capacity | Library:CONSTRAINT |
| S813-W045 | Nesting | Library:CONSTRAINT |
| S813-W046 | Duplicates | Library:CONSTRAINT |

## Material distinctions

- Different hot-folder limits / intervals in S1760 and S1673 remain source-specific; normalization does not silently choose one version.
- RAW constraints, Lightroom catalog transfer and non-RAW replacement are separate stages; roundtrip support does not establish RAW rendering/export support.
- Print means documented printable QR cards or Print sharpening only, not tested printers/media/color output.
- Explicit cloud deletion/cache risks and temporary pricing/region/plan terms stay in the source condition snapshot; they are competitor documentation, not SUITE policy.

## Validation

JSON contains one assignment for every exact frozen category===WORKFLOW key, 42 article chains covering every assignment, and 256 valid workflow projections. No source key or referenced workflow is missing or duplicated. Physical operation chains were not run.

Frozen source SHA-256: `280C30AE064B003DBBEF3D0BE05E075E929619F5D322AF946D57D1D8179FA066`.
