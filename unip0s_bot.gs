/**
 *  __   __  __    _  ___   _______  _______  _______    _______  _______  _______ 
 * |  | |  ||  |  | ||   | |       ||       ||       |  |  _    ||       ||       |
 * |  | |  ||   |_| ||   | |    _  ||   _   ||  _____|  | |_|   ||   _   ||_     _|
 * |  |_|  ||       ||   | |   |_| ||  | |  || |_____   |       ||  | |  |  |   |  
 * |       ||  _    ||   | |    ___||  |_|  ||_____  |  |  _   | |  |_|  |  |   |  
 * |       || | |   ||   | |   |    |       | _____| |  | |_|   ||       |  |   |  
 * |_______||_|  |__||___| |___|    |_______||_______|  |_______||_______|  |___|  
 */
function main() {
  Logger.log('start.');
  const LIMIT_GIVE_POINT = 120/* 送れる最大ポイント */;
  // 非公開モノはプロパティから。
  const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
  const USER = SCRIPT_PROPERTIES.getProperty('email_address'/* ユーザID */);
  const PASSWORD = SCRIPT_PROPERTIES.getProperty('password');
  const TEAM_NAME = SCRIPT_PROPERTIES.getProperty('team_name'/* 社名 */);
  const FRIENDS_UNAME_CSV = SCRIPT_PROPERTIES.getProperty('friends_uname'/* 友人群CSV */);
  if (!USER || !PASSWORD || !TEAM_NAME || !FRIENDS_UNAME_CSV) {
    Logger.log('check script property.');
    return false;
  }
  const friends_uname_ary = Utilities.parseCsv(FRIENDS_UNAME_CSV)[0];
  const friends_count = friends_uname_ary.length;
  if (!friends_count) {
    Logger.log('no friend?');
    return false;
  }
  // auth-tokenを得る
  const payload_login = {"jsonrpc":"2.0","method":"Unipos.Login","params":{"email_address": USER,"password": PASSWORD},"id":"Unipos.Login"};
  const auth_info = post_url_rpc_c(payload_login);
  if (!auth_info) {
    Logger.log('auth fail?');
    return false;
  }
  if (auth_info.error) {
    Logger.log('[LOGIN] ERROR:' + auth_info.error.message);
    return false;
  }  
  const authn_token = auth_info.result.authn_token;
  if (!authn_token) {
    Logger.log('no token?');
    return false;
  }
  const PAYLOAD_GET_PROFILE = {"jsonrpc":"2.0","method":"Unipos.GetProfile","params":[],"id":"Unipos.GetProfile"};
  const profile = post_url_rpc_q(authn_token, PAYLOAD_GET_PROFILE);
  if (!profile) {
    Logger.log('no profile?');
    return false;
  }  
  if (profile.error) {
    Logger.log('[GET_PROFILE] ERROR:' + profile.error.message);
    return false;
  }  
  if (profile.result.team.name != TEAM_NAME) {
    Logger.log('other corp?');
    return false;
  }
  const my_id = profile.result.member.id;
  var left_point = parseInt(profile.result.member.pocket.available_point, 10);
  if (left_point < 1) {
    Logger.log('no point left/left_point=' + left_point);
    return false;
  }
  // TODO:社員100人超えたら修正（いつ？）
  const PAYLOAD_FIND_SUGGEST_MEMBERS = {"jsonrpc":"2.0","method":"Unipos.FindSuggestMembers","params":{"term":"","limit":100},"id":"Unipos.FindSuggestMembers"};
  const member_list = post_url_rpc_q(authn_token, PAYLOAD_FIND_SUGGEST_MEMBERS);
  if (!member_list) {
    Logger.log('no one survive?');
    return false;
  }
  if (member_list.error) {
    Logger.log('[FIND_SUGGEST_MEMBERS] ERROR:' + member_list.error.message);
    return false;
  }  
  // ポイント平均化、余剰は最初の友人へ。
  var avg_point = Math.floor(left_point / friends_count);
  var mod_point = left_point - (avg_point * friends_count);
  // ひとりずつ愛をこめて配布  
  for each(var friend in friends_uname_ary) {
    for each(var member in member_list.result) {      
      // イケてない％object対象のバイナリサーチ関数見当たらない。
      if (member.uname == friend) {
        var to_id = member.id;
        var giving_point_with_love = avg_point + mod_point;
        mod_point = 0;
        if (giving_point_with_love > LIMIT_GIVE_POINT) {
          giving_point_with_love = LIMIT_GIVE_POINT;
        }
        var quotation = get_quotation();
        var payload_send_card = {"jsonrpc":"2.0","method":"Unipos.SendCard","params":{"from_member_id":my_id,"to_member_id":to_id,"point":giving_point_with_love,"message":quotation},"id":"Unipos.SendCard"};
        Logger.log(payload_send_card);
        var send_result = post_url_rpc_c_with_token(authn_token, payload_send_card);
        if (!send_result) {
          Logger.log('send card fail.');
          return false;
        }
        if (send_result.error) {
          Logger.log('[SEND_CARD] ERROR:' + send_result.error.message);
          return false;
        }  
        left_point -= giving_point_with_love;
        break;
      }
    }
    if (left_point < 1) break;
    // 連打は良くない！3秒待とう
    Utilities.sleep(3 * 1000);    
  }
  Logger.log('completed.');
  return true;
}

function post_url_rpc_c(payload) {
  const URL_RPC_C = 'https://unipos.me/c/jsonrpc';
  return post_url_rpc(URL_RPC_C, false, payload);
}

function post_url_rpc_c_with_token(token, payload) {
  if (!token) return null;
  const URL_RPC_C = 'https://unipos.me/c/jsonrpc';
  return post_url_rpc(URL_RPC_C, token, payload);
}

function post_url_rpc_q(token, payload) {
  if (!token) return null;
  const URL_RPC_Q = 'https://unipos.me/q/jsonrpc';
  return post_url_rpc(URL_RPC_Q, token, payload);
}

function post_url_rpc(url, token, payload) {
  if (!url || !payload) return null;
  // Object.Assignが無い。。。
  var options;
  if (!token) {
    options = {
      'method': 'POST'
      ,'headers': {'Content-Type': 'application/json'}
      ,'muteHttpExceptions': true
      ,'payload': JSON.stringify(payload)
    };
  } else {
    options = {
      'method': 'POST'
      ,'headers': {
        'Content-Type': 'application/json'
        ,'x-unipos-token': token
      }
      ,'muteHttpExceptions': true
      ,'payload': JSON.stringify(payload)
    };
  }
  const response = UrlFetchApp.fetch(url, options);
  return (response.getResponseCode() == 200) ? 
    JSON.parse(response.getContentText('UTF-8')) : false;  
}

function get_quotation() {
  const URL_QUOTATION = 'http://www.meigensyu.com/quotations/view/random';
  const FAIL_SAFE_BODY = '╭( ･ㅂ･)و ̑̑ ｸﾞｯ !';
  const response = UrlFetchApp.fetch(URL_QUOTATION, {'muteHttpExceptions': true});
  if (response.getResponseCode() != 200) return FAIL_SAFE_BODY;

  const REGEXP_QUERY = /<div class=\"meigenbox\">([\s\S]*?)<\/a>/g;
  const elems = response.getContentText('UTF-8').match(REGEXP_QUERY);
  if (!elems) return FAIL_SAFE_BODY;

  var quotation = elems[0];
  quotation = quotation.replace(/(^\s+)|(\s+$)/g, '').replace(/<\/?[^>]+>/gi, '');
  if (!quotation) return FAIL_SAFE_BODY;

  const value = quotation.split("\r\n");
  return (value.length < 3) ? FAIL_SAFE_BODY : value[1] + '（' + value[2] + '）';
}
