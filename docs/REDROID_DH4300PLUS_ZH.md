# 绿联 DH4300 Plus 跑安卓云手机（redroid + ws-scrcpy-web）完整部署教程

适用机型：绿联 DH4300 Plus（RK3588C / UGOS Pro）。DH4300 Plus 只有一个内核版本，不用查也没法换，按本文直接做。

**先确认你要不要跟着做第一、二步：**

| 平台 | 系统 | 是否缺模块 |
|---|---|---|
| 绿联 DH4300 Plus（RK3588C） | UGOS Pro | 缺 `binder_linux` 与 `rk_dma32_heap`，**必须照本文加载** |
| RK3588 / RK3582 跑飞牛（fnOS），如 Rock5C（RK3582） | fnOS | 模块自带且完整，**不用加载模块**，直接从第三节建容器开始 |
| 极空间 T2S（RK3588） | 极空间系统 | 同上，模块自带，**不用加载模块**，从第三节开始 |

换句话说：本文的一、二、四节只对“系统里没有这两个模块”的机器（典型就是绿联 UGOS）有意义；飞牛、极空间这类已经把 binder 与 dma-buf heap 打进去的系统，跳过模块部分也能正常跑 redroid。

全流程四段：

1. 加载两个内核模块（`binder_linux`、`rk_dma32_heap`）——仅缺模块的系统需要
2. 建 redroid 容器（带随机序列号）
3. 开机自启，重启后全自动——仅用了第一、二步的机器需要
4. 装 ws-scrcpy-web，浏览器里连设备，并开启密码登录

> 全部命令用 `root` 执行（`sudo -i`）。
> 下文用变量 `MOD_DIR` 表示模块目录，默认 `/volume1/docker/kmod`，想换路径只改这一行。

---

## 一、准备

```bash
# 1. 设备节点必须齐全，缺任何一个都会黑屏或退回软渲染
ls /dev/mali0 /dev/mpp_service /dev/rga /dev/dma_heap/system /dev/dma_heap/cma

# 2. docker 可用
docker info >/dev/null && echo docker-ok

# 3. 建模块目录（一定放数据盘，系统分区重启会被重置）
MOD_DIR=/volume1/docker/kmod
mkdir -p "$MOD_DIR" && echo "$MOD_DIR"
```

下载两个模块：

```bash
wget -O "$MOD_DIR/binder_linux.ko" \
  https://github.com/hling110/binder_linux/releases/download/0.0.1/binder_linux.ko

wget -O "$MOD_DIR/rk_dma32_heap.ko" \
  https://github.com/RideWindOne/ws-scrcpy-web/releases/download/v0.5.13/rk_dma32_heap.ko
```

校验一下（`rk_dma32_heap.ko` 应为 384080 字节）：

```bash
ls -l "$MOD_DIR"/*.ko
md5sum "$MOD_DIR/rk_dma32_heap.ko"     # e8aa55cbad6833df6f4b36452546c730
file "$MOD_DIR/rk_dma32_heap.ko"       # 应为 ARM aarch64 ELF
```

---

## 二、加载模块

```bash
MOD_DIR=/volume1/docker/kmod

insmod "$MOD_DIR/binder_linux.ko"
insmod "$MOD_DIR/rk_dma32_heap.ko"

lsmod | grep -E "binder_linux|rk_dma32"
ls -l /dev/dma_heap/
```

`/dev/dma_heap/` 下应出现 `system-uncached` 与 `system-uncached-dma32` 两个节点，这两个是 `rk_dma32_heap` 注册的堆。

> 报 `File exists` 是已经加载过，跳过即可。

---

## 三、创建 redroid 容器（带随机序列号）

序列号用随机值，多台设备或多个容器时 ws-scrcpy-web 不会认成同一台：

```bash
SN=$(cat /proc/sys/kernel/random/uuid | tr -d '-' | cut -c1-16)
echo "serialno=$SN"
```

> 这个值只影响"设备身份"，不涉及任何认证；容器重建时会重新生成，等价于一台新设备。

建容器：

```bash
docker run -d \
  --name redroid \
  --privileged \
  --restart unless-stopped \
  -p 5555:5555 \
  -v /volume1/docker/data:/data \
  -v /dev/mali0:/dev/mali0 \
  -v /dev/mpp_service:/dev/mpp_service \
  -v /dev/rga:/dev/rga \
  -v /dev/dma_heap/system:/dev/dma_heap/system \
  -v /dev/dma_heap/cma:/dev/dma_heap/cma \
  cnflysky/redroid-rk3588:lineage-20 \
  androidboot.redroid_width=1080 \
  androidboot.redroid_height=2400 \
  androidboot.redroid_dpi=440 \
  androidboot.redroid_fps=60 \
  androidboot.redroid_gpu_mode=mali \
  androidboot.redroid_fake_wifi=1 \
  androidboot.redroid_enable_input_subsys=1 \
  androidboot.serialno="$SN" \
  ro.adb.secure=0 \
  ro.build.characteristics=default
```

几个不能省的：

| 参数 | 作用 |
|---|---|
| `--privileged` | 容器内要 mount binderfs，缺了起不来 |
| `-v /dev/mali0` | Mali GPU，缺了没硬加速 |
| `-v /dev/mpp_service`、`/dev/rga` | VPU 硬编解与图像处理 |
| `-v /dev/dma_heap/system`、`/dev/dma_heap/cma` | 图形缓冲的堆 |
| `androidboot.redroid_gpu_mode=mali` | 强制走 Mali，缺了黑屏或软渲染 |
| `ro.adb.secure=0` | 免授权即可被 ws-scrcpy-web / adb 连上 |
| `androidboot.serialno="$SN"` | 设备身份，随机生成，避免多设备重名 |

等它起完（一般 40–60 秒）：

```bash
for i in $(seq 1 60); do
  b=$(docker exec redroid getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  [ "$b" = "1" ] && { echo "boot ok after ${i}s"; break; }
  sleep 2
done

docker exec redroid getprop ro.serialno     # 应等于上面生成的 $SN
```

---

## 四、开机自启（一条命令写入）

### 4.1 启动脚本

`MOD_DIR` 先设成你的路径，下面整段直接粘：

```bash
MOD_DIR=/volume1/docker/kmod

cat > /usr/local/bin/redroid-boot.sh <<'EOF'
#!/bin/bash
set -e

# 模块目录：改路径只改这一行
MOD_DIR="@MOD_DIR@"

# 等 docker 就绪，最多 30 秒
for i in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done

DMA32_KO="$MOD_DIR/rk_dma32_heap.ko"
[ -f "$DMA32_KO" ] || { echo "rk_dma32_heap.ko not found in $MOD_DIR"; exit 1; }

# binder 模块允许放在两个位置之一，按实际取
BINDER_KO=""
for p in "$MOD_DIR/binder_linux.ko" /volume1/docker/binder/binder_linux.ko; do
  [ -f "$p" ] && { BINDER_KO="$p"; break; }
done
[ -n "$BINDER_KO" ] || { echo "binder_linux.ko not found in $MOD_DIR"; exit 1; }

# 幂等加载：已在 /proc/modules 里就跳过
for spec in "binder_linux:$BINDER_KO" "rk_dma32_heap:$DMA32_KO"; do
  name="${spec%%:*}"; ko="${spec#*:}"
  grep -qw "$name" /proc/modules || /sbin/insmod "$ko"
done

sleep 2

# 容器没跑就拉起来
if [ "$(docker inspect -f '{{.State.Running}}' redroid 2>/dev/null)" != "true" ]; then
  docker start redroid
fi
EOF

sed -i "s#@MOD_DIR@#${MOD_DIR}#g" /usr/local/bin/redroid-boot.sh
chmod +x /usr/local/bin/redroid-boot.sh
head -8 /usr/local/bin/redroid-boot.sh     # 确认路径已替换
```

### 4.2 写服务并启用

```bash
cat > /etc/systemd/system/redroid-boot.service <<'EOF'
[Unit]
Description=Redroid kernel modules and container
After=local-fs.target docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/redroid-boot.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now redroid-boot.service
systemctl is-enabled redroid-boot.service    # 应为 enabled
```

脚本幂等，容器正在跑时手动触发也不会打架：

```bash
systemctl start redroid-boot.service
```

---

## 五、装 ws-scrcpy-web

镜像 `ridewindone/ws-scrcpy-web:latest`，浏览器里直接操作设备，不用装客户端。

### 5.1 建容器（带临时放行参数）

```bash
mkdir -p /volume1/docker/wsdata

docker run -d \
  --name ws-scrcpy-web \
  --restart unless-stopped \
  -p 8000:8000 \
  -v /volume1/docker/wsdata:/data \
  -e WS_SCRCPY_ALLOW_REMOTE_ADMIN=1 \
  ridewindone/ws-scrcpy-web:latest
```

- `/data` 是它的全部家当（配置、用户、密码、依赖、日志都在里面），**必须挂持久卷**，重建容器才能不丢；
- `-p 8000:8000` 让局域网能打开设置页，浏览器 `http://<NAS_IP>:8000`；
- `-e WS_SCRCPY_ALLOW_REMOTE_ADMIN=1` 是**临时**放行管理接口——容器里的管理操作默认只认本机回环，经端口映射进来会被判"非本机"而拒绝，不放开就没法设密码。设完按 5.2 删掉重建，这个参数不再带；
- 等 30 秒左右，`docker ps` 看到 `(healthy)` 就绪。这期间端口是无密码状态，只在内网短暂存在，尽快做 5.2。

### 5.2 设置密码并开启登录，然后删了重建

**① 设置密码并开启登录**（界面或命令行，二选一）

界面：浏览器打开 `http://<NAS_IP>:8000` → 设置 → 用户 → 点「管理用户」→「添加用户」→ 红色区块填**管理员用户名 + 管理员密码**，下面再填一个**新用户** → 点「安全设置并添加用户」，一步同时创建管理员并开启登录。

命令行（在 NAS 上执行）：

```bash
curl -s -c /tmp/wc http://127.0.0.1:8000/ -o /dev/null
curl -s -b /tmp/wc -X POST http://127.0.0.1:8000/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"wind","role":"admin","password":"你的用户密码","adminUsername":"admin","adminPassword":"你的管理员密码"}' \
  -w "\nhttp=%{http_code}\n"
rm -f /tmp/wc
```

期望 `{"ok":true}` 与 `http=201`。

**两个名字不能重名**：`username`（第一个用户）和 `adminUsername`（管理员）取同一个值时会被拒，返回
`409 could not complete first-user setup (the admin may already be secured, or the username is taken)`。
用户叫 `wind`、管理员叫 `admin` 就不会撞。

**② 删掉重建，把放行参数去掉**

```bash
docker stop ws-scrcpy-web && docker rm ws-scrcpy-web

docker run -d \
  --name ws-scrcpy-web \
  --restart unless-stopped \
  -p 8000:8000 \
  -v /volume1/docker/wsdata:/data \
  ridewindone/ws-scrcpy-web:latest
```

账号密码存在数据卷 `wsscrcpy.db` 里，重建后照旧生效；管理接口同时收回"仅本机"，局域网只能登录看设备和远程操作，不能改配置。

**③ 验证登录确实开了**

```bash
docker exec ws-scrcpy-web node -e 'fetch("http://127.0.0.1:8000/api/config").then(r=>r.text()).then(t=>console.log(t.slice(0,60)))'
```

返回 `{"error":"unauthorized"}` 表示**登录已开启**（未开时会返回完整配置）。之后浏览器打开地址会先出现登录页。

> 密码先用纯字母数字跑通（`Abc123456`），带引号的特殊字符容易在粘贴时被 shell 吃掉；跑通后可以在界面里改。

### 5.3 改密码 / 换端口 / 换目录

全部配置与用户都存在数据卷的 `wsscrcpy.db` 里，所以标准做法是**删容器重建，密码不会丢**：

```bash
docker stop ws-scrcpy-web && docker rm ws-scrcpy-web

docker run -d \
  --name ws-scrcpy-web \
  --restart unless-stopped \
  -p 8000:8000 \
  -v /volume1/docker/wsdata:/data \
  ridewindone/ws-scrcpy-web:latest
```

重建后原来的账号密码照旧生效；要换密码，登录后在 设置 → 用户 里改即可（也可以按 5.2 的流程重来一次：加参数建 → 设新密码 → 去掉参数重建）。

### 5.4 在网页里添加设备

1. 浏览器打开（隧道或局域网地址），登录；
2. 添加设备，填 `127.0.0.1:5555`（如果 ws-scrcpy-web 与 redroid 在**同一台** NAS 上且用 host 网络）或 `<NAS_IP>:5555`；
3. 设备名默认取自序列号，多台容器不会重名——这就是第三步用随机 `serialno` 的原因；想改名字在设备卡片上直接编辑。

---

## 六、验证清单

重启后逐条过：

```bash
lsmod | grep -E "binder_linux|rk_dma32"                  # 两个都在，in-use 非 0
docker exec redroid ls /dev/dma_heap/                     # system / cma / system-uncached / system-uncached-dma32
docker exec redroid getprop sys.boot_completed            # 1
docker exec redroid getprop ro.serialno                   # 是你生成的那个
docker ps --format '{{.Names}} {{.Status}}' | grep -E "redroid|ws-scrcpy"
dmesg | grep -c "Internal error"                          # 0
```

关键判据：容器内 `/dev/dma_heap/` 里要有 `system-uncached`、`system-uncached-dma32`，出现它们才说明 `rk_dma32_heap` 真的生效；只有 `system`/`cma` 就是模块没加载。

---

## 七、常见问题

| 现象 | 原因与处理 |
|---|---|
| `insmod: File exists` | 模块已加载，跳过即可 |
| 容器内只有 `system`、`cma` | `rk_dma32_heap` 没加载，`lsmod` 确认后看 `dmesg` |
| 容器黑屏 | 少绑 `/dev/mali0`，或没加 `androidboot.redroid_gpu_mode=mali` |
| `boot_completed` 一直不置 1 | `docker logs redroid`，多数是 binderfs 没 mount（缺 `--privileged`） |
| 重启后模块不见了 | 模块放到了 `/lib/modules`，被系统分区重置；移到数据盘并确认服务已 enable |
| ws-scrcpy-web 打开只有设备列表、没有管理按钮 | 没开登录且不是本机访问；按 5.2 开登录 |
| ws-scrcpy-web 重建后账号没了 | 数据卷没挂或挂错，配置全在 `/data` 的 `wsscrcpy.db` |
| `screencap` 返回空文件 | 目标停在图案/密码锁屏这类安全界面时不允许截屏，属正常 |

---

## 八、回滚

```bash
docker stop ws-scrcpy-web redroid
docker rm ws-scrcpy-web redroid
systemctl disable --now redroid-boot.service
rmmod rk_dma32_heap
```

---

## 九、三条硬性禁忌

1. **不要把 binderfs 写进 `/etc/fstab`**。它依赖运行时加载的模块，写进 fstab 后重启会卡进 emergency mode，整机 SSH/Web 全断，只能接显示器救。容器里 mount 就够了。
2. **模块不要放 `/lib/modules`**。UGOS 系统分区重启会重置，放数据盘才留得住。
3. **不要在 `media_serv` / `hetero_core` 运行时 `rmmod rk_dma32_heap`**，画面会立刻黑掉甚至重启。
