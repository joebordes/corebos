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
function SendFileTask($) {
	var map = fn.map;
	var dict = fn.dict;
	var filter = fn.filter;
	var reduceR = fn.reduceR;
	var parallelExecuter = fn.parallelExecuter;
	var contains = fn.contains;
	var concat = fn.concat;
	var vtinst = new VtigerWebservices('webservice.php');

	function handleError(fn) {
		return function (status, result) {
			if (status) {
				fn(result);
			} else {
				errorDialog('Failure:'+result);
			}
		};
	}

	function referencify(desc) {
		var fields = desc['fields'];
		for (var i=0; i<fields.length; i++) {
			var field = fields[i];
			var type = field['type'];
			if (type['name']=='owner') {
				type['name']='reference';
				type['refersTo']=['Users'];
			}
		}
		return desc;
	}

	function diff(reflist, list) {
		var out = [];
		$.each(list, function (i, v) {
			if (contains(reflist, v)) {
				out.push(v);
			}
		});
		return out;
	}

	function fillSelectBox(id, modules, parentModule, filterPred) {
		if (filterPred==null) {
			filterPred = function () {
				return true;
			};
		}
		var parent = modules[parentModule];
		var fields = parent['fields'];
		function filteredFields(fields) {
			return filter(
				function (e) {
					var fieldCheck = !contains(['autogenerated', 'reference', 'owner', 'multipicklist', 'password', 'string', 'datetime', 'text'], e.type.name);
					var predCheck = filterPred(e);
					return fieldCheck && predCheck;
				},
				fields
			);
		}

		var moduleFieldTypes = {};
		$.each(modules, function (k, v) {
			moduleFieldTypes[k] = dict(map(function (e) {
				return [e['name'], e['type']];
			}, filteredFields(v['fields'])));
		});
		var select = $('#'+id);
		var optionClass = id+'_option';
		$.each(moduleFieldTypes, function (module, field) {
			$.each(field, function (k, v) {
				if (k == id) {
					for (var i in v.picklistValues) {
						var selected = '';
						if (adapter != '' && adapter === v.picklistValues[i].value) {
							selected = 'selected="true"';
						}
		 				select.append('<option '+selected+' class="'+optionClass+'" value="'+v.picklistValues[i].value+'">' + v.picklistValues[i].label + '</option>');
					}

				}
			});
		});
	}
	function getDescribeObjects(accessibleModules, moduleName, callback) {
		vtinst.describeObject(moduleName, handleError(function (result) {
			var parent = referencify(result);
			var fields = parent['fields'];
			var referenceFields = filter(function (e) {
				return e['type']['name']=='reference';
			}, fields);
			var referenceFieldModules =
				map(
					function (e) {
						return e['type']['refersTo'];
					},
					referenceFields
				);
			function union(a, b) {
				var newfields = filter(function (e) {
					return !contains(a, e);
				}, b);
				return a.concat(newfields);
			}
			var relatedModules = reduceR(union, referenceFieldModules, [parent['name']]);
			relatedModules = diff(accessibleModules, relatedModules);

			function executer(parameters) {
				var failures = filter(function (e) {
					return e[0]==false;
				}, parameters);
				if (failures.length!=0) {
					var firstFailure = failures[0];
					callback(false, firstFailure[1]);
				} else {
					var moduleDescriptions = map(function (e) {
						return referencify(e[1]);
					}, parameters);
					var modules = dict(map(function (e) {
						return [e['name'], e];
					}, moduleDescriptions));
					callback(true, modules);
				}
			}
			var p = parallelExecuter(executer, relatedModules.length);
			$.each(relatedModules, function (i, v) {
				p(function (callback) {
					vtinst.describeObject(v, callback);
				});
			});
		}));
	}

	$(document).ready(function () {
		vtinst.extendSession(handleError(function (result) {
			vtinst.listTypes(handleError(function (accessibleModules) {
				if (accessibleModules.includes('cbCredentials')) {
					getDescribeObjects(accessibleModules, 'cbCredentials', handleError(function (modules) {
						fillSelectBox('adapter', modules, 'cbCredentials');
					}));
					document.getElementById('adapter').selected = adapter;
				}
			}));
		}));
		document.getElementById('credentialid').value = credentialid;
		document.getElementById('credentialid_display').value = credentialid_display;
	});
}
SendFileTask(jQuery);

var auth = {
	getAuthToken : function (value) {
		if (value == 'GoogleCloudStorage') {
			var credentialid = document.getElementById('credentialid').value;
			fetch(
				'index.php?module=com_vtiger_workflow&action=com_vtiger_workflowAjax&actionname=auth&method=getAuthToken',
				{
					method: 'post',
					headers: {
						'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
					},
					credentials: 'same-origin',
					body: '&'+csrfMagicName+'='+csrfMagicToken+'&service='+value+'&credentialid='+credentialid
				}
			).then(response => response.json()).then(response => {
				if (response.session != true) {
					window.open(response.session, '', 'width=500,height=500');
				}
			});
		}
	}
};