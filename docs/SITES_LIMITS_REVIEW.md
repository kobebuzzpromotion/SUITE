# Sites / Worker / D1 / R2 Limits Review

調査日: 2026-10-03。A研究専任、編集は本docのみ。公式Cloudflare docsとinstalled Sites plugin 0.1.75参照を照合した。Sites checkout/tool、hosting manifest、server/UI、provider、公開設定は変更しない。顔解析のPrivacy BLOCKは継続。数値の公式確認は実転送/本番可用性PASSではない。

## 結論と適用範囲

RAW上限128MiBは **134,217,728 bytes**。Free/Proの単発100MB受信上限より大きく、Workerの128MBメモリとも別問題になる。128MiB全体をWorkerの`arrayBuffer()`/JSON/base64へ読み込んで処理・hash・R2 putする経路は、上限と複製/同時requestを考慮できない。R2 multipartを**小さい独立HTTP request**で転送し、Workerをbounded streamingに保つ方式を検討する必要がある。単一128MiB POSTをWorker内部で分割しても入口のrequest capは回避できない。

8MiB固定partなら128MiBは16parts。これは公式R2制限に収まる**候補計算**で、Sites dispatcherの独自上限・実plan・runtime・権限・peak memoryを確認した実装ではない。Cloudflare一般値からSitesの実契約を推定しない。顔SDKの調査待ちをRAW/global/Crop/非人物保存/作者フローの開始条件にはしない。

## 公式Cloudflare数値

以下は2026-10-03読取り時点。MB/GBはdocsの表記をそのまま残し、MiB/GiBと混同しない。

| 項目 | 公式値 / plan | SUITEでの意味 |
| --- | --- | --- |
| inbound request body | Cloudflare Free/Pro100MB、Business200MB、Enterprise最大5GB（self-serve） | Workers Free/Paidと異なるaccount/zone plan。超過413。Sites実plan/実設定UNKNOWN |
| Worker memory | Free/Paidとも128MB、**per-isolate**、JS heap+WASM allocations | invocation専有128MBではない。同isolate同時requestも使う。128MiB RAW全bufferを安全枠としない |
| CPU/HTTP | Free10ms、Paid default30s・最大300s | streaming待機とCPUは別。認証/hash/metadata処理の実CPUはNOT_RUN |
| HTTP wall time | client接続中はhard duration limitなし、disconnect/終了後`waitUntil`最大30s延長 | upload/verifyの永続job保証ではない。中断後再開が必要 |
| simultaneous outgoing setup | invocationにつき6 | 複数read/write/D1を無制限並列にしない |
| static individual asset | Free/Paidとも25MiB | 大きい原本をstatic deploy assetにしない。モデル/WASM配布条件とは別 |

根拠: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)（page updated2026-09-05、Request and response/Memory/CPU/Duration/Connections/Static Assets各section）。公式[Streams](https://developers.cloudflare.com/workers/runtime-apis/streams/)もbodyの全buffer化を避ける理由を説明する。設定増枠・Paidへの変更・別providerの選択は本調査で行わない。

## R2 multipartの境界

| 項目 | 確認した値・契約 |
| --- | --- |
| non-final part minimum | 5MiB =5,242,880bytes。最後だけ小さくできる |
| part maximum | upload guideは5GiBと表記。limits footnoteはsingle request/part/copy最大を5GiB未満5MiB（4.995GiB）と補足。巨大partの厳密上限はその小さい値を安全側に扱う。8MiB候補には影響なし |
| parts | 最大10,000。非最終partはすべて同size |
| total object | 表は5TiB、limits footnoteは5TiB未満5GiB（4.995TiB）。SUITE128MiBを拡張する根拠にしない |
| metadata/key | object metadata8,192bytes、key1,024bytes |
| same key write | 表は1write/sec、超過429。multipart uploadPart適用細部を一般PUT値から推定しない。bounded retry/backoff必要 |
| unfinished upload | default7日でabort、lifecycle設定により変わる。Sites実bucket設定UNKNOWN |

根拠: [R2 limits](https://developers.cloudflare.com/r2/platform/limits/)（updated2026-06-08、footnotesを含む）、[Upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/)（updated2026-07-29、Multipart upload details）。5GiB/5TiBのrounded summaryとfootnoteを消して一意の厳密byte保証にしない。

`createMultipartUpload(key)`で開始し、`uploadPart(partNumber, ReadableStream)`の返却`partNumber/etag`を保持する。`complete(uploadedParts)`はそれらを必要とし、resolve後のobjectは後続readで見える。`resumeMultipartUpload(key,uploadId)`は存在/有効性を検証しないので、upload/complete/abort時の消滅・並列操作エラーを処理する。[Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

client→Workerの各partもinbound limitを受けるが、別requestに分ければtotal128MiBが単発入口capを超える問題を回避できる。[Workers multipart usage](https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/)（updated2026-07-31）。公式サンプルのunowned key/自由uploadIdや高並列設定をそのままアプリの認可設計に採用しない。

multipart ETagはwhole-file SHA256ではない。part ETagはMD5、完成ETagはbinary part MD5連結のhashとpart数由来。client申告SHA256をR2 customMetadataに書いたことも、server側bytesの検証にならない。[Upload objects — ETags](https://developers.cloudflare.com/r2/objects/upload-objects/#etags)

## D1はmetadata、原本はR2

| D1制限 | 公式値 |
| --- | --- |
| database最大 | Workers Paid10GB / Free500MB |
| account storage最大 | Paid1TB / Free5GB |
| databases/account | Paid50,000 / Free10 |
| string/BLOB/row最大 | 2,000,000bytes |
| SQL statement最大 | 100,000bytes |
| bound parameters/query | 100 |
| query duration最大 | 30s |
| queries/invocation | Paid1,000 / Free50（Worker limitsも適用） |
| columns/table | 100 |
| Time Travel | Paid30日 / Free7日 |

batch内もstatementごとの限界は残り、databaseはsingle-threadedで過負荷時queue/overloadedになり得る。[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)（updated2026-04-21）。RAW/PNG/JPEGをD1 BLOB/大JSONに保存せず、owner、Asset、Recipe/revision、upload inventory、R2 key、size/hash、検証状態等のbounded metadataに分離する。履歴が無限に一rowへ伸びる保存も避ける必要があるが、本docは新DB schemaを決定しない。D1 Time TravelはR2原本recoveryの保証ではない。

## installed Sites参照で確認できること

参照root: `C:/Users/user/.codex/plugins/cache/openai-curated-remote/sites/0.1.75/skills/sites-building/`。

- `references/persistence-and-storage.md`: D1はstructured durable state、R2はblob、両者をowner/filename/status等metadataで関連付ける。server prepared statementは一statementずつ、関連操作はbatch。migrationは生成・保存・適用境界を保持し、runtime initでschema改変しない。失敗時はinput保持/recoverable error。
- `references/starter-capabilities.md`: `.openai/hosting.json`のlogical D1/R2 bindingを使用し、R2はserver-side `env`からのみアクセス。Sitesが実Cloudflare resource/wiringを管理する。
- `references/authentication.md`: dispatcherがChatGPT sign-inとuser headerを扱う。**SIWCはworkspace membership/招待認可の証明ではない**。安定user IDは同一Site内でowner keyに使える。全APIでserver-side identity/owner/必要なallowlistを確認する。service bypass credentialはsigned-in user/consentを供給しない。
- Sites skillのlifecycle ownershipに従い、checkout/tools/source/publicationはmainのみ。本agentは研究docだけ。profile setup/登録/公開/API問い合わせをしていない。

三参照のSHA256（順に）: `64ee58edbc690f4ea63ca58655ff82e0c3910264708cd23b184056d68b0fbf94`、`63b96e690590c7f807a89061c8047761ec510d7e330724d34c65d21d52a21ef1`、`e3ff59aa5c6935bd026718927f87682c351c768838f082793106a599194997f1`。

これらにSites dispatcher固有のrequest-body byte cap、実契約plan、per-Site R2/D1 quota、transfer deadline、available crypto runtimeの数値保証は記載されていない。Cloudflare一般docsでそれらを埋めない。ChatGPT helperはapp-owned OAuth/provider置換ではなく、予約signin/signout/callback routeはdispatch所有、API未認証はredirectではなく拒否が必要。

## 128MiB RAWに必要なbounded-transfer候補（未実装判定）

1. authenticated ownerと選択Assetにboundしたupload開始metadataを小さいJSONで検証する。total bytes1..134,217,728、wholeOriginal SHA256、同じOriginal/既存契約、R2 key、part size/countをserverで固定する。filename/Content-Length/client SHAのみを信用してCloudSafeにしない。
2. clientは`Blob.slice`等で固定8MiBを順次送る候補。128MiBなら16parts、任意sizeなら`ceil(bytes/8MiB)`で最後だけshort。multipart/form-dataやbase64の不要なcopy/overheadではなくbinary bodyで、workerはknown-length/実byte数を上限内に数えながらR2 uploadPartへstreamする。Sitesの実stream伝播・8MiB入口許容は未検証。
3. 各partNumberのrange、固定offset/expected size、uploadId/key/owner/Asset一致、retry時の同part同内容を検証し、成功ETagをbounded inventoryとして保存する。uploadIDを持つことだけで権限を与えない。まず1partずつでmemory/backpressureを確認する候補で、合計isolate concurrency安全保証ではない。
4. complete manifestは重複/欠番/未確認ETag/size違いを拒否し、server保持inventoryと照合する。immutable Original keyへのoverwrite、二重complete、client disconnect/期限切れ、complete成功後D1失敗を別状態で扱う必要がある。R2とD1を跨ぐatomic transaction保証を仮定しない。既存原本保持/Recovery仕様を本docで変更しない。
5. complete後にR2 objectのactual sizeを確認し、**R2 actual bytesを逐次SHA256検証**する。Cloudflareの`crypto.DigestStream('SHA-256')`はstreamを書き込んでもdataを保持しない公式extension。`R2.get(key).body`をsingle-consumer pipeでhashする候補は全128MiB `arrayBuffer()`よりbounded。無制御`tee()`で片branchを放置してmemory queueを膨らませない。Sites実runtime/CPU/time/backpressure/verification結果はNOT_RUN。[Workers Web Crypto — DigestStream](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/#constructors)
6. readback SHA+size一致と既存Cloud Safe契約の要件を満たして初めてverified stateへ進める。upload completeのHTTP200だけ、ETagだけ、customMetadata SHAだけで原本削除/CloudSafe/業務完了としない。不一致・D1/R2部分失敗時もローカル原本を保持する。巨大verifyが実budgetを超えた場合のjob/分割verification設計はmain判断で、未接続をPASSにしない。
7. downloadはowner-authorized R2 `body`をstreamして原本bytesを変えない。server全buffer/再encode、public r2.dev原本公開、browserへのR2 secret渡しを避ける。browser側のLibRaw/RGBA/Final peak memoryは**Cloudflare128MBとは別**で、現24MP/128MiB guardが端末安定性を証明するわけではない。

`DigestStream`はCloudflare extensionで、標準browser `crypto.subtle.digest`のstream対応ではない。serverでRAWdecode/顔解析へ移動する提案でもない。静的配布の読取りではLibRaw WASM853,083bytes、MediaPipe SIMD WASM11,756,954bytes/非SIMD10,960,242bytesで25MiB単assetより小さいが、license/モデルPrivacy/本番CSP/正しいbundle配布は独立Gate。

## 未確認と最小Evidence

| 未確認 | main側の最短確認 / 記録 |
| --- | --- |
| SITES_EFFECTIVE_BODY_LIMIT_UNKNOWN | actualSite routeで8MiB binaryの許容/拒否を確認。公式上限とは別のdispatcher/proxy上限を記録。拒否なら契約確認後に合法な>=5MiB非最終part方式を検討し、上限未満の極小partでR2規則を破らない |
| SITES_PLAN_QUOTA_UNKNOWN | Sitesのnative metadata/supportされる運用情報で実Worker/D1/R2条件をmain確認。ダッシュボード権限/課金増枠を勝手に作らない |
| STREAMING_MEMORY_NOT_RUN | actualWorker最大128MiB transfer、1part/複数user、abort/slowclient、peak/exceededMemory/CPUを記録。16part試算や小file成功を最大file合格にしない |
| HASH_READBACK_NOT_RUN | complete object actual bytes/size/SHAを確認。改ざんpart、欠番、wrongETag、falseclientSHA、complete後metadata失敗でfail closed |
| AUTH_OWNER_BOUNDARY_NOT_RUN | 未ログイン・別user・別uploadID/key/Asset・招待外・expiredsessionを拒否。本人reload/resumeだけ成功。SIWC成功だけをinviteGateにしない |
| LIFECYCLE_RECOVERY_UNKNOWN | actualbucket incomplete期限、complete/D1部分失敗、期限切れ後UI/原本保持。既存OriginalRecovery design-onlyを実装済としない |
| REAL_RAW_LIFECYCLE_NOT_RUN | 許諾camera RAWのimport→global→save/reload→Original Final→checksum。synthetic payloadは転送試験のみでRAWdecode品質の代用にしない |

調査の結論は **OFFICIAL_LIMITS_CONFIRMED / SITES_EFFECTIVE_LIMITS_UNKNOWN / BOUNDED_TRANSFER_CANDIDATE / CLOUD_TRANSFER_NOT_RUN**。顔Privacy BLOCK維持。新Provider選定・公開・実装変更はなし。

## 少人数試用のfree枠・資源会計追補（2026-10-03）

この追補は公式一般枠の調査と設計上の確認事項であり、Sites実契約・実残量・実課金を確定するものではない。既存Sites-managedの同一BUCKETだけを使う方針を維持する。新Provider/new bucket/増枠契約/公開を行わず、顔SDK停止も維持する。前節の候補/未実行記述は当時のcheckpointであり、後続実装の有無をこの読取り調査で再判定していない。

| 公式の一般Free枠 | 単位・適用範囲 | この試用で未確定な点 |
| --- | --- | --- |
| R2 Standard storage 10 GB-month | **月間**。各日のpeak storageを30日billing periodで平均するstorage算定。瞬間10GBの強制停止上限やuserごとの10GB割当ではない | actualSites plan、accountの他Site/他bucket使用、billing period、現在の実使用、追加料金の扱い |
| R2 Class A 1,000,000 requests | **月間**。create/uploadPart/complete/list等を含む。単に「file1個=write1回」ではない | 実呼出し、retry/ack lost、list/verification、他Siteの使用量 |
| R2 Class B 10,000,000 requests | **月間**。get/head等を含む。readback checksumやdownloadも独立操作 | 実呼出し、provider集計の遅延、account全体残量 |
| D1 rows_read 5,000,000 / rows_written 100,000 | **日次**、00:00 UTC reset。readは返却件数ではなく走査rows、index更新もwriteに加算される | 実plan、query/index設計、usage全体、超過時の実アプリ拒否挙動 |
| D1 total storage 5 GB | Free account全体のstorage。各asset/memberに5GBを割り当てる意味ではない | 実D1容量、他DB/table/indexの使用、Sites固有条件 |
| Workers 100,000 requests / CPU 10 ms | Freeのrequestsは**日次**、CPUは**invocationごと**。R2/D1 quotaと別勘定 | actualSites Worker plan、dispatcherのcount、CPU telemetry/実最大負荷 |

R2の無料枠はStandard限定。直接R2からのegress無料と、他のmetered serviceも無料であることは同義ではない。料金をここで契約/固定せず、無料operationに原本削除が含まれる場合も**NO RAW DELETE**方針を変えない。[R2 pricing](https://developers.cloudflare.com/r2/pricing/)

D1の日次上限超過はFreeでquery errorになり得る。usageはquery returnの`meta.rows_read`、`meta.rows_written`、`meta.duration`、`meta.size_after`等とprovider側usageを区別して記録する。query件数だけでrows budgetを判定しない。[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 return object](https://developers.cloudflare.com/d1/worker-api/return-object/)

Workersの128MBはisolateのmemoryであり、RAW128MiBを丸ごとbufferできる保証ではない。HTTPのwall timeとCPU timeは別で、network待ちはCPUに含まれず、接続が存続している間のHTTP wall timeに一般的な固定上限はない。`performance.now()`等のelapsedだけを10ms CPU合格の根拠にしない。[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

### 会計・容量拒否の重大確認事項（設計risk、source未監査）

1. **同一BUCKET ≠ free枠の独占。** app ledgerに記録したbytes/opsだけでaccount全体のfree残量を保証しない。provider actual値・取得時刻・集計遅延・対象account/bucketのscopeを保持し、取得できない値はUNKNOWN/nullであって0ではない。Sitesの実planは引き続き`SITES_PLAN_QUOTA_UNKNOWN`。
2. **予約は並行importに対してatomic。** new uploadを許可する前にD1側でcapacity reservation/CAS等を行う設計をmainで確認する。単純なused読取り→各requestが空きありと判定→別々にwriteでは超過を防げない。committed Original、in-flight parts、staged upload、その他同一BUCKET objectsも容量観測から漏らさない。D1/R2跨ぎatomic commitは仮定しない。
3. **再開・部分失敗で予約を消さない。** 同一正常partのresumeで二重予約せず、bad part再PUTを無制御の増量許可にしない。R2 complete成功後D1失敗/応答喪失では実体bytesが残り得るため、状態照合前のreservation releaseは禁止する設計を確認する。近上限ではNEW importを制限し、既存Originalの読取り/保存/書出しと、予約済jobの安全な再開を不要に閉じ込めない。容量回復のためのRAW自動削除/evictionは行わない。
4. **operation単位を正しく分ける。** 128MiBを8MiB×16partsで一度ずつ成功させる例では、create+16 uploadPart+completeだけで18 Class A操作になる。list/resume/retryは追加、get/head/readbackはClass Bとして別途観測する。HTTP request数、R2 A/B数、D1 rows、attempt数、成功数、billable estimate、provider actualを同一counterにしない。失敗/ack lostの全操作が無料であるとは未確認。
5. **計測自身のbudgetも有限。** D1 metadata/metrics書込みとindexもrows_written/storageを使う。毎pixel/毎byteのlog、計測logの再帰計測、全table scanによる残量計算を避ける必要がある。bounded aggregateとcorrelation IDで追跡し、Original本文・token・秘密値をtelemetryに含めない。browser処理elapsed、server wall、D1 duration、provider CPUは別字段とし、未計測を0ms/PASSにしない。

これらはSites checkout/product sourceを読んで発見した確定bugではなく、main専有のreservation/accounting実装を受入れる際の重大確認事項。最小確認は、並行2import、part応答喪失resume、complete後D1失敗、残量UNKNOWN、近上限NEW拒否/既存原本保持を同一managed BUCKETで記録すること。人工bytesのtransfer testはNONRAWに限定し、実cloud・実RAWの合格を代用しない。

### 試用configと50GB事業baselineの境界

少人数試用の`TRIAL_RESOURCE_CONFIG`は、無料枠内運用を狙う保守的な容量headroom・daily/monthly budget・new-import制限を別途固定する設定であり、元の50GB事業baselineを満たしたというEvidenceでも、製品要件を10GBへ書き換える承認でもない。10 GB-monthの公式枠を10 GiB hardcapへ勝手に変換しない。試用ceilingはbytes単位とscopeを明記し、account他用途を含む余裕・計測不能時の拒否条件をmainで決定する。具体的なceiling、契約plan、実残量、本番課金、実RAW品質はこの調査では未確定。

追補の状態: **OFFICIAL_FREE_UNITS_CONFIRMED / ACTUAL_SITES_PLAN_UNKNOWN / RESOURCE_LEDGER_SOURCE_NOT_REVIEWED / REAL_CLOUD_AND_RAW_NOT_RUN**。他docs/tests/product sourceおよび旧Evidenceは変更なし。

## quota/multipart source読取りcheckpoint（2026-10-03）

今回のみ`apps/sites/src/usage.mjs`と`worker.mjs`、schema/既存Node試験をread-onlyで照合した。Sites tools、Sites checkout、product source、tests、旧Evidenceは変更していない。この節は直前の`RESOURCE_LEDGER_SOURCE_NOT_REVIEWED`を当該2sourceの範囲だけ更新する。deployment/runtime、実D1/R2、実RAW、account全体残量は依然NOT_RUN/UNKNOWN。

読取り時SHA256: usage `5846549E3CC8CCFFE45C57A1EC235724CA0AFF5063223F17C016ACE31661479D`、worker `E07387AED2E556350C5659EED30DE1FE12660EADE0A0AD15D22F5F65397112D3`。下記行番号はこのcheckpointだけに対応する。

### sourceで確認した保持・拒否境界（runtime PASSではない）

- `usage:2,4`はpositive safe-integer storage limitを要求し、新assetでstaging+finalの`size*2`をSQLのSUM条件内で予約する。`worker:133`は予約とasset生成をD1 batchへ入れる。`usage:5–11`はobject追加と追加予約にもSQL内条件を使う。読取り範囲ではclient値だけで予約を飛ばす経路、予約bytesの自動減算/期限解除、RAW/正常part/破損partのdelete経路を見つけなかった。これを実並行D1の上限保証へ昇格しない。
- 正常partはSHA+sizeの実readback一致でskip。修理は新しいobject keyを作り、過去の正常/破損bytesを上書き/削除しない（`worker:154–162`）。completeはtoken/leaseによるCAS、finalの実SHA+size照合、D1 commit後だけCloudSafeへ進める（`worker:166–175`）。中断catchはstatusをUPLOADINGへ戻すが、object/予約を消さない。未完了R2 multipartのabort呼出しもこの2sourceにはない。残った物理bytesを回収済と主張せず、bucket lifecycle/運用Recoveryは別未確認。
- REQUEST limit未設定/不正はhandler前に拒否（`usage:16–17,34`）。STORAGE未設定/不正は新asset予約前、R2 A/B未設定/不正は各該当R2呼出し前に拒否（`usage:2,27–32`）。ただしすべての変数をnew-import開始前に一括検証しているわけではない。
- `/trial/usage`はadmin-only、scopeはTHIS_SUITE_SITE_ONLY_NOT_ACCOUNT_FREE_BALANCE、CPUはNOT_AVAILABLE_WALL_TIME_IS_NOT_CPU（`worker:128`）。account残量/CPUについての誇張はこの返却では見つけなかった。

### 具体的な欠陥・不足と最短試験案

| ID / 優先 | checkpointの具体的source問題 | 最短試験案（未実行、NONRAW mockと実cloudを区別） |
| --- | --- | --- |
| QSR01 / P1 | `worker:62–66`のverifyOriginal catchがquota/config/network失敗まで`cloud_safe=0`へ変更する。READY complete（166）は後の実検証成功時もflagを戻さず、Original GET（145）はfalseを検証前に拒否する。健全bytesが一時障害後も恒久WAITINGになる経路 | healthy READYを保存→R2 read budgetを使い切る/一度だけgetをthrow→Original GET失敗→budget/通信復旧→READY complete→Original GET。bytes/key/recipe不変のまま元状態へ戻せるか。現sourceではcompleteがfalse Assetを返し得る。破損実SHAの場合の拒否を緩めない |
| QSR02 / P1 | `worker:44–45`のverifiedPart catchがquota/config/transient read失敗を実破損と同じ`verified:false`へ畳む。GET resumeで正常partが未verifiedとなり、次のPUTは正常な旧bytesを残したまま新copyを予約/書込む候補になる。unknown inspectionとchecksum不一致の区別がない | 正常part保持→getだけ一度throw/READ limit超過→resume GETとPUT→通信復旧。quota失敗を破損修理として扱って新key/予約を増やさず、正常bytesが不変か。SHA不一致ならbad partだけ新key修理する独立positive control |
| QSR03 / P2 | `usage:37`のmetrics INSERT/UPDATEはwrapped DBの外から直接runし、自身のreturn metaをrows/unknownへ含めない。daily D1消費が少なくともそのquery分だけ過少になる。wall値もこのmetrics write完了時間を含まず、handler wallの範囲を明示する必要 | 正確なmetaを返すD1 doubleで全SQLのrows_read/writtenを集計し、保存metricsのsumと比較。metrics SQL自身の消費/未取得を別記録または明示scopeへ含めること。実D1 provider usageとは別値として保持 |
| QSR04 / P2 | R2 WRITE/READ設定を欠く状態でも`worker:131–133`の新asset POSTはstorage/REQUEST設定があれば201と予約を作り得る。最初の該当R2操作までconfiguration failureが遅れる。既存SW19はREQUEST変数だけを削除しており、この組合せを検証しない | 4必須変数を1つずつ未設定/0/非整数にして新asset POST→upload開始→PUTを確認。new-import開始時拒否を求める方針なら、A/B未設定でもasset/reservationを作らないこと。auth/既存読取りを不必要に一律停止する方針はここで追加しない |
| QSR05 / 要追加並行試験 | 同じ正常partの同時PUTは両方がpreviousなしを観測して別keyを作り得る。SQL容量条件による迂回は見つけなかったが、duplicate retained bytesにより合法なfinal用余裕を消費する。`reserveObject`の増枠→insertは2statementで、競合時は余分な保守的予約が残り得る | quotaをちょうど`2*size`に固定して同asset/samepartの2PUTを同時開始。各object/予約sumがcapを超えず、旧bytes不変、finalがfalse成功にならないこと。distinct assetsの同時new POST、repairとcomplete競合、期限切れ旧assemblyと新assemblyの競合も確認 |
| QSR06 / 要追加中断試験 | createMultipartUpload後のuploadPart/complete/streaming digest/D1失敗はデータと予約を保持する設計。source上cleanup/abortはなく、actual incomplete multipart bytesとledgerの一致・期限切れ後再試行は未検証 | 各stageでack loss/disconnect/fault、lease expiry、retryを注入。new final keyごとの予約保持、tokenを失った旧jobがCloudSafeを書換えないこと、正常part/key/SHA不変、予約を勝手に解放しないこと。realR2 lifecycle観測は独立NOT_RUN |

QSR01–04は読取りで成立する制御/計測上の問題で、再現fixture実行のPASS/FAIL Evidenceはこの追補で作成していない。既存SW17–21のNode fixturesはactualSQLite SQL＋mock R2/D1 interfaceの範囲で、実Cloudflareの通信・CPU/memory・quota境界は証明しない。また現sourceにD1 rows/dayのadmission gateは見つけず、D1自身のFree拒否以外の予防上限は未実装範囲。request capをD1 rows capの代わりに保証しない。

現checkpoint結論: **SOURCE_RETENTION_PATHS_REVIEWED / QSR01–04_OPEN / CONCURRENT_AND_INTERRUPT_TESTS_NEEDED / REAL_SITES_AND_RAW_NOT_RUN**。顔SDK停止、同一managed BUCKET、NO RAW DELETEを維持。変更権限は文書追補のみ。

### main修正の後続読取り（同日、上記checkpointは保存）

追補作成中にmainがsourceを更新した。後続SHA256はusage `1C3EBAB8AFF3517F2B74F54A3279D8420A51B9007A74EEFE423A09BA6212AD98`、worker `56C0F7BCF934289D35E4238CCFFF9625C4C789D05EAFF1783A468D262FEC82E6`。

- QSR01: verifyOriginalがORIGINAL_MISSING/CHECKSUM_MISMATCH以外を再throwし、READY completeもactual検証成功後だけCloudSafe flag復旧するsourceへ変更されている。**SOURCE_FIX_OBSERVED / REGRESSION_NOT_RUN_BY_REVIEWER**。
- QSR02: verifiedPartのcatch-allを除き、quota/transient read失敗はFALSEの破損判定へ変換せず伝播するsourceへ変更されている。**SOURCE_FIX_OBSERVED / REGRESSION_NOT_RUN_BY_REVIEWER**。
- QSR04: measureRequest開始時validateLimitsが4変数をpositive safe-integerとして一括検証し、handler前に拒否するsourceへ変更されている。**SOURCE_FIX_OBSERVED / REGRESSION_NOT_RUN_BY_REVIEWER**。
- QSR03のmetrics write自身が集計外という範囲は後続sourceにも残る。全D1消費と称さずexcluded scope/unknownを明記するか別途測定する必要がある。QSR05–06の追加並行/中断試験と実D1/R2判定は引き続き未実行。

この後続読取りはsource修正を観測しただけで、実cloud、実RAW、free内運用、CPU/memory、全quota競合のPASSではない。他ファイルは編集していない。
