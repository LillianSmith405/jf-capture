'use strict';
// 小蜂管家 CI 抓包 hook（GitHub Actions 模拟器环境）
// 以 Java 层(OkHttp)为主，兼容 x86_64 模拟器 + ARM 转译

var DOMAINS = ['jftech', 'xmeye'];

function isHit(url) {
  for (var i = 0; i < DOMAINS.length; i++) {
    if (url.indexOf(DOMAINS[i]) !== -1) return true;
  }
  return false;
}

Java.perform(function () {
  console.log('[+] 小蜂管家 hook 已加载');

  // ---------- 1. OkHttp 同步请求 ----------
  try {
    var RealCall = Java.use('okhttp3.RealCall');
    RealCall.execute.implementation = function () {
      var resp = this.execute();
      try {
        var req = resp.request();
        var url = req.url().toString();
        if (isHit(url)) {
          console.log('\n===== SYNC ' + resp.code() + ' =====');
          console.log('[URL] ' + url);
          var h = req.headers();
          for (var i = 0; i < h.size(); i++) console.log('[HDR] ' + h.name(i) + ': ' + h.value(i));
          var b = resp.peekBody(200000).string();
          console.log('[BODY] ' + (b.length > 8000 ? b.substring(0, 8000) + '...(' + b.length + 'B)' : b));
        }
      } catch (e) {}
      return resp;
    };

    // ---------- 2. OkHttp 异步请求 ----------
    var Callback = Java.use('okhttp3.Callback');
    RealCall.enqueue.implementation = function (cb) {
      var Wrapped = Java.registerClass({
        name: 'com.jf.hook.CiCallback',
        implements: [Callback],
        methods: {
          onFailure: function (call, e) { try { cb.onFailure(call, e); } catch (x) {} },
          onResponse: function (call, resp) {
            try {
              var req = resp.request();
              var url = req.url().toString();
              if (isHit(url)) {
                console.log('\n===== ASYNC ' + resp.code() + ' =====');
                console.log('[URL] ' + url);
                var h = req.headers();
                for (var i = 0; i < h.size(); i++) console.log('[HDR] ' + h.name(i) + ': ' + h.value(i));
                var b = resp.peekBody(200000).string();
                console.log('[BODY] ' + (b.length > 8000 ? b.substring(0, 8000) + '...(' + b.length + 'B)' : b));
              }
            } catch (e) {}
            try { cb.onResponse(call, resp); } catch (x) {}
          }
        }
      });
      this.enqueue(Wrapped);
    };
    console.log('[+] OkHttp hooked');
  } catch (e) {
    console.log('[!] OkHttp hook: ' + e);
  }

  // ---------- 3. native 签名（best-effort，转译环境下可能无效）----------
  try {
    var lib = Module.findBaseAddress('libXCloudSDK.so');
    console.log('[+] libXCloudSDK @ ' + lib);
    var fn = Module.findExportByName('libXCloudSDK.so', 'Java_com_lib_XCloudSDK_GetAuthSignInfo');
    if (!fn) fn = Module.findExportByName('libXCloudSDK.so', 'XCloudSDK_GetAuthSignInfo');
    if (fn) {
      Interceptor.attach(fn, {
        onLeave: function (retval) {
          try {
            var env = Java.vm.getEnv();
            var s = env.getStringUtfChars(retval, null);
            if (s) console.log('[SIGN] ' + s.readCString());
          } catch (e) {}
        }
      });
      console.log('[+] GetAuthSignInfo hooked @ ' + fn);
    } else {
      console.log('[!] GetAuthSignInfo 未导出（转译环境下常见，跳过）');
    }
  } catch (e) {
    console.log('[!] native hook: ' + e);
  }

  // ---------- 4. 凭证转储 ----------
  try {
    var AT = Java.use('android.app.ActivityThread');
    var ctx = AT.currentApplication().getApplicationContext();
    var dir = Java.use('java.io.File').$new(ctx.getFilesDir().getParent() + '/shared_prefs');
    var files = dir.listFiles();
    if (files) {
      for (var i = 0; i < files.length; i++) {
        var name = files[i].getName();
        if (name.indexOf('.xml') <= 0) continue;
        try {
          var sp = ctx.getSharedPreferences(name.substring(0, name.length - 4), 0);
          var all = sp.getAll();
          var keys = all.keySet().toArray();
          console.log('\n[SP] ' + name + ' (' + keys.length + ')');
          for (var j = 0; j < keys.length; j++) {
            var k = keys[j].toString();
            var v = all.get(k);
            var low = k.toLowerCase();
            if (low.indexOf('token') >= 0 || low.indexOf('user') >= 0 || low.indexOf('login') >= 0 ||
                low.indexOf('uuid') >= 0 || low.indexOf('appkey') >= 0 || low.indexOf('secret') >= 0 ||
                low.indexOf('session') >= 0 || low.indexOf('device') >= 0) {
              console.log('  [*] ' + k + ' = ' + v);
            }
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.log('[!] SP dump: ' + e);
  }
});
