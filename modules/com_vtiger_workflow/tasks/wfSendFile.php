<?php
/*************************************************************************************************
 * Copyright 2020 JPL TSolucio, S.L. -- This file is a part of TSOLUCIO coreBOS Customizations.
 * Licensed under the vtiger CRM Public License Version 1.1 (the "License"); you may not use this
 * file except in compliance with the License. You can redistribute it and/or modify it
 * under the terms of the License. JPL TSolucio, S.L. reserves all rights not expressly
 * granted by the License. coreBOS distributed by JPL TSolucio S.L. is distributed in
 * the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. Unless required by
 * applicable law or agreed to in writing, software distributed under the License is
 * distributed on an "AS IS" BASIS, WITHOUT ANY WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied. See the License for the specific language governing
 * permissions and limitations under the License. You may obtain a copy of the License
 * at <http://corebos.org/documentation/doku.php?id=en:devel:vpl11>
 *************************************************************************************************
 *  Author       : JPL TSolucio, S. L.
 *************************************************************************************************/
require_once 'modules/com_vtiger_workflow/VTEntityCache.inc';
require_once 'modules/com_vtiger_workflow/VTWorkflowUtils.php';
require_once 'modules/com_vtiger_workflow/expression_engine/include.inc';
require_once 'vendor/autoload.php';

class wfSendFile extends VTTask {
	public $executeImmediately = true;
	public $_accessToken = array();

	public function getFieldNames() {
		return array('adapter', 'credentialid', 'credentialid_display');
	}

	public function doTask(&$entity) {
		global $adb, $site_URL, $current_language, $default_charset;

		$workflow_context = $entity->WorkflowContext;
		$query = 'select * from vtiger_cbcredentials inner join vtiger_crmentity on crmid=cbcredentialsid where deleted=0 and adapter=? and cbcredentialsid=?';
		$result = $adb->pquery($query, array($this->adapter, $this->credentialid));
		$data = $result->FetchRow();
		if ($adb->num_rows($result) == 0) {
			return [];
		}
		if ($this->adapter == 'FTP') {
			require_once 'modules/com_vtiger_workflow/actions/FTP.php';
			$ftp = new FTPAdapter($data, $workflow_context);
			$ftp->setUp();
			$ftp->writeFile();
		} elseif ($this->adapter == 'AzureBlobStorage') {
			require_once 'modules/com_vtiger_workflow/actions/AzureBlobStorage.php';
			$azure = new AzureAdapter($data, $workflow_context);
			$azure->setUp();
			$azure->writeFile();
		} elseif ($this->adapter == 'OpenCloud') {
			require_once 'modules/com_vtiger_workflow/actions/OpenCloud.php';
			$cloud = new OpenCloudAdapter($data, $workflow_context);
			$cloud->setUp();
			$cloud->writeFile();
		} elseif ($this->adapter == 'GoogleCloudStorage') {
			require_once 'modules/com_vtiger_workflow/actions/GoogleStorage.php';
			$client = new Google_Client();
			$client->setClientId($data['google_clientid']);
			$client->setClientSecret($data['google_client_secret']);
			$client->setRedirectUri($site_URL.'/notifications.php?type=googlestorage');
			$client->setDeveloperKey($data['google_developer_key']);
			$client->setAccessType('offline');
			$client->setApplicationName($data['google_application_name']);
			$client->setScopes(explode(',', $data['google_scopes']));

			$refresh_token = json_decode($data['google_refresh_token'], true);
			if (isset($refresh_token) && $refresh_token!='') {
				$this->_accessToken = array(
					'access_token' => $refresh_token['refresh_token'],
					'created' => $refresh_token['created'],
					'expires_in' => $refresh_token['expires_in'],
				);
				$client->setAccessToken($this->_accessToken);
			}
			if ($client->isAccessTokenExpired()) {
				$client->refreshToken($refresh_token['refresh_token']);
				$new_token = $client->getAccessToken();
				$adb->pquery('update vtiger_cbcredentials set google_refresh_token=? where adapter=? and cbcredentialsid=?', array(
						json_encode($new_token, JSON_UNESCAPED_SLASHES),
						'GoogleCloudStorage',
						$this->credentialid
				));
				$this->_accessToken = array(
					'access_token' => $new_token['refresh_token'],
					'created' => $new_token['created'],
					'expires_in' => $new_token['expires_in'],
				);
				$client->setAccessToken($this->_accessToken);
			}
			$storage = new GoogleStorageAdapter($data, $client, $workflow_context);
			$storage->setUp();
			$storage->writeFile();
		}
	}
}
?>