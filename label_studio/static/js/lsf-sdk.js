/*
 * Label Studio Frontend SDK - inter-layer code that connects LSB server
 * implementation with the Frontend part. At the moment it's based on
 * callbacks.
 */

const API_URL = {
  MAIN: "api",
  TASKS: "/tasks",
  COMPLETIONS: "/completions",
  CANCEL: "/cancel",
  PROJECTS: "/projects",
  NEXT: "/next/",
  EXPERT_INSTRUCTIONS: "/expert_instruction"
};

const Requests = (function(window) {
  const handleResponse = res => {
    if (res.status !== 200 || res.status !== 201) {
      return res;
    } else {
      return res.json();
    }
  };

  const wrapperRequest = (url, method, headers, body) => {
    return window
      .fetch(url, {
        method: method,
        headers: headers,
        credentials: "include",
        body: body,
      })
      .then(response => handleResponse(response));
  };

  const fetcher = url => {
    return wrapperRequest(url, "GET", { Accept: "application/json" });
  };

  const fetcherAuth = async (url, data) => {
    const response = await window.fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(data.username + ":" + data.password),
      },
      credentials: "same-origin",
    });
    return handleResponse(response);
  };

  const poster = (url, body) => {
    return wrapperRequest(url, "POST", { Accept: "application/json", "Content-Type": "application/json" }, body);
  };

  const patch = (url, body) => {
    return wrapperRequest(
      url,
      "PATCH",
      {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body,
    );
  };

  const remover = (url, body) => {
    return wrapperRequest(
      url,
      "DELETE",
      {
        "Content-Type": "application/json",
      },
      body,
    );
  };

  return {
    fetcher: fetcher,
    poster: poster,
    patch: patch,
    remover: remover,
  };
})(window);

const _loadTask = function(ls, url, reset,completionID) {
    try {
        const req = Requests.fetcher(url);

        req.then(function(loadedTask) {
            if (loadedTask instanceof Response && loadedTask.status === 404) {
                ls.setFlags({ isLoading: false, noTask: true });
                return;
            }

            if (loadedTask instanceof Response && loadedTask.status === 403) {
                ls.setFlags({ isLoading: false, noAccess: true });
                return;
            }

            loadedTask.json().then(response => {
                /**
                 * Convert received data to string for MST support
                 */
                // ls = LSF_SDK("label-studio", response.label_config_line, null);
                // ls.LS.config(response.label_config_line)
                if (reset == true) {
                    response.completionID = completionID
                    ls.resetState();
                    delete window.LSF_SDK;
                    window.LSF_SDK = LSF_SDK("label-studio", response.layout, null, true, response);
                    // ls = window.LSF_SDK;
                } else {
                    /**
                     * Add new data from received task
                     */
                response.data = JSON.stringify(response.data);
                    ls.setFlags({isLoading: false});
                    ls.resetState();
                    ls.assignTask(response);
                    ls.initializeStore(_convertTask(response));
                    let cs = ls.completionStore;
                    let c;
                    if (cs.predictions.length > 0) {
                        c = ls.completionStore.addCompletionFromPrediction(cs.predictions[0]);
                    }

                    // we are on history item, take completion id from history
                    else if (ls.completionStore.completions.length > 0 && completionID) {
                        c = {id: completionID};
                    } else if (ls.completionStore.completions.length > 0 && completionID === 'auto') {
                        c = {id: ls.completionStore.completions[0].id};
                    } else {
                        c = ls.completionStore.addCompletion({userGenerate: true});
                    }

                    if (c.id) cs.selectCompletion(c.id);


                    ls.onTaskLoad(ls, ls.task);
                }
            })
        });
    } catch (err) {
        console.error("Failed to load next task ", err);
    }
};

const loadNext = function(ls,rest) {
  var url = `${API_URL.MAIN}${API_URL.PROJECTS}/1${API_URL.NEXT}`;
    return _loadTask(ls, url,rest);
};

const loadTask = function(ls, taskID, completionID,reset=false) {
  var url = `${API_URL.MAIN}${API_URL.TASKS}/${taskID}/`;
    return _loadTask(ls, url,reset, completionID);
};

const _convertTask = function(task) {
  // converts the task from the server format to the format
  // supported by the LS frontend
  if (!task) return;

  if (task.completions) {
    for (let tc of task.completions) {
      tc.pk = tc.id;
      tc.createdAgo = tc.created_ago;
      tc.createdBy = tc.created_username;
      tc.leadTime = tc.lead_time;
    }
  }

  if (task.predictions) {
    for (let tp of task.predictions) {
      tp.pk = tp.pk;
      tp.createdAgo = tp.created_ago;
      tp.createdBy = tp.created_by;
      tp.createdDate = tp.created_date;
    }
  }

  return task;
};

const LSF_SDK = function(elid, config, task, reset, response) {

  const showHistory = task === null;  // show history buttons only if label stream mode, not for task explorer

  const _prepData = function(c, includeId) {
    var completion = {
      lead_time: (new Date() - c.loadedDate) / 1000,  // task execution time
      result: c.serializeCompletion()
    };
    if (includeId) {
        completion.id = parseInt(c.id);
    }
    const body = JSON.stringify(completion);
    return body;
  };

  function initHistory(ls) {
      if (!ls.taskHistoryIds) {
          ls.taskHistoryIds = [];
          ls.taskHistoryCurrent = -1;
      }
  }
  function addHistory(ls, task_id, completion_id) {
      ls.taskHistoryIds.push({task_id: task_id, completion_id: completion_id});
      ls.taskHistoryCurrent = ls.taskHistoryIds.length;
  }

  var LS = new LabelStudio(elid, {
    config: config,
    user: { pk: 1, firstName: "Awesome", lastName: "User" },

    task: _convertTask(task),
    interfaces: [
      "basic",
      "panel", // undo, redo, reset panel
      "controls", // all control buttons: skip, submit, update
      "submit", // submit button on controls
      "update", // update button on controls
      "predictions",
   //   "predictions:menu", // right menu with prediction items
      "completions:menu", // right menu with completion items
     // "completions:add-new",
     // "completions:delete",
      "side-column", // entity
      "skip",
       "leaderboad",
       "messages",
        "entity",
    ],

    onSubmitCompletion: function(ls, c) {
      ls.setFlags({ isLoading: true });
      const req = Requests.poster(`${API_URL.MAIN}${API_URL.TASKS}/${ls.task.id}${API_URL.COMPLETIONS}/`, _prepData(c));

      req.then(function(httpres) {
        httpres.json().then(function(res) {
          if (res && res.id) {
              c.updatePersonalKey(res.id.toString());
              addHistory(ls, ls.task.id, res.id);
          }

          if (task) {
            ls.setFlags({ isLoading: false });
          } else {
            loadNext(ls, true);
          }
        });
      });

      return true;
    },

    onTaskLoad: function(ls) {
      // render back & next buttons if there are history
      if (showHistory && ls.taskHistoryIds && ls.taskHistoryIds.length > 0) {
        var firstBlock = $('[class^=Panel_container]').children().first();
        var className = firstBlock.attr('class');
        var block = $('<div class="'+className+'"></div>');
        // prev button
        block.append('<button type="button" class="ant-btn ant-btn-ghost" ' +
                     (ls.taskHistoryCurrent > 0 ? '': 'disabled') +
                     ' onclick="window.LSF_SDK._sdk.prevButtonClick()">' +
                     '<i class="ui icon fa-angle-left"></i> Prev</button>');
        // next button
        block.append('<button type="button" class="ant-btn ant-btn-ghost"' +
                     (ls.taskHistoryCurrent < ls.taskHistoryIds.length ? '': 'disabled') +
                     ' onclick="window.LSF_SDK._sdk.nextButtonClick()">' +
                     'Next <i class="ui icon fa-angle-right"></i></button>');
        firstBlock.after(block);
      }
    },

    onUpdateCompletion: function(ls, c) {
      ls.setFlags({ isLoading: true });

      const req = Requests.patch(
        `${API_URL.MAIN}${API_URL.TASKS}/${ls.task.id}${API_URL.COMPLETIONS}/${c.pk}/`,
        _prepData(c)
      );

      req.then(function(httpres) {
        ls.setFlags({ isLoading: false });
        // refresh task from server
        loadTask(ls, ls.task.id, ls.completionStore.selected.id, false);
      });
    },

    onDeleteCompletion: function(ls, completion) {
      ls.setFlags({ isLoading: true });

      const req = Requests.remover(`${API_URL.MAIN}${API_URL.TASKS}/${ls.task.id}${API_URL.COMPLETIONS}/${completion.pk}/`);
      req.then(function(httpres) {
        ls.setFlags({ isLoading: false });
      });
    },

    onSkipTask: function(ls) {
      ls.setFlags({ loading: true });
      var c = ls.completionStore.selected;
      var completion = _prepData(c, false);

      Requests.poster(
        `${API_URL.MAIN}${API_URL.TASKS}/${ls.task.id}${API_URL.CANCEL}`,
        completion
      ).then(function(response) {
        response.json().then(function (res) {
          if (res && res.id) {
            c.updatePersonalKey(res.id.toString());
            addHistory(ls, ls.task.id, res.id);
          }

          if (task) {
            ls.setFlags({ isLoading: false });
            // refresh task from server
            loadTask(ls, ls.task.id, res.id);
          } else {
            loadNext(ls,true);
          }
        })
      });

      return true;
    },

    onGroundTruth: function(ls, c, value) {
      Requests.patch(
        `${API_URL.MAIN}${API_URL.TASKS}/${ls.task.id}${API_URL.COMPLETIONS}/${c.pk}/`,
        JSON.stringify({ honeypot: value })
      );
    },

    onLabelStudioLoad: function(ls) {
      var self = ls;
      ls.onTaskLoad = this.onTaskLoad;  // FIXME: make it inside of LSF
      ls.onPrevButton = this.onPrevButton; // FIXME: remove it in future
      initHistory(ls);
      if (reset == false) {
          if (!task) {
              ls.setFlags({isLoading: true});
              loadNext(ls, false);
          // }
          } else {
            if (!task.completions || task.completions.length === 0) {
                var c = ls.completionStore.addCompletion({userGenerate: true});
                ls.completionStore.selectCompletion(c.id);
            }
            // else {
            //     ls.addUserRanks(task.userranks);
            // }
          }
      } else {
        response.data = JSON.stringify(response.data);
        ls.setFlags({isLoading: false});
        ls.resetState();
        ls.assignTask(response);
        cTask = _convertTask(response);
        ls.initializeStore(cTask);
        let cs = ls.completionStore;
        let c;
        if (cs.predictions.length > 0) {
            c = ls.completionStore.addCompletionFromPrediction(cs.predictions[0]);
        }

        // we are on history item, take completion id from history
        else if (ls.completionStore.completions.length > 0 && response.completionID) {
            c = {id: response.completionID};
        } else if (ls.completionStore.completions.length > 0 && response.completionID === 'auto') {
            c = {id: ls.completionStore.completions[0].id};
        } else {
            c = ls.completionStore.addCompletion({userGenerate: true});
        }

        if (c.id) cs.selectCompletion(c.id);
           // ls.onTaskLoad(ls, response);
      }
    }
  });

  // TODO WIP here, we will move that code to the SDK
  var sdk = {
      "loadNext": function () { loadNext(LS) },
      "loadTask": function (taskID, completionID) { loadTask(LS, taskID, completionID) },
      'prevButtonClick': function() {
          LS.taskHistoryCurrent--;
          let prev = LS.taskHistoryIds[LS.taskHistoryCurrent];
          loadTask(LS, prev.task_id, prev.completion_id);
      },
      'nextButtonClick': function() {
          LS.taskHistoryCurrent++;
          if (LS.taskHistoryCurrent < LS.taskHistoryIds.length) {
            let prev = LS.taskHistoryIds[LS.taskHistoryCurrent];
            loadTask(LS, prev.task_id, prev.completion_id);
          }
          else {
            loadNext(LS, true);  // new task
          }
      }
  };

  LS._sdk = sdk;

  return LS;
};
