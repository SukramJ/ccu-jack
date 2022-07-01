
// UserModal is a modal dialog for editing user settings.
function UserModal() {
    var user, create, pwdCheck, changePwd

    // mithril component
    return {
        oninit: function (vnode) {
            if (vnode.attrs.user != null) {
                // change user
                user = Object.assign({}, vnode.attrs.user)
                create = false
                pwdCheck = user.Password
                changePwd = user.Password !== ""
            } else {
                // new user
                user = { Identifier: "", Active: true, Description: "", Password: "" }
                create = true
                pwdCheck = ""
                changePwd = true
            }
        },
        view: function (vnode) {
            // validation
            var idOk = user.Identifier.length > 0
            var pwdOk = user.Password === pwdCheck && (create ? user.Password.length > 0 : true)
            var allOk = idOk && pwdOk

            return m(".modal.active",
                m(".modal-overlay"),
                m(".modal-container",
                    m(".modal-header",
                        m("button.btn.btn-clear.float-right", { onclick: function () { vnode.attrs.onclose(null) } }),
                        m(".modal-title.h5", "Berechtigung " + (create ? "anlegen" : "ändern")),
                    ),
                    m(".modal-body",
                        m(".content",
                            m(".form-group",
                                m("label.form-label[for=id-input]", "Anmeldekennung:"),
                                m("input.form-input[type=text][id=id-input][placeholder=Kennung]", {
                                    class: idOk ? "is-success" : "is-error",
                                    value: user.Identifier,
                                    oninput: function (e) { user.Identifier = e.target.value },
                                    oncreate: function (vnode) { vnode.dom.focus() }
                                })
                            ),
                            m(".form-group",
                                m("label.form-switch",
                                    m("input[type=checkbox]", {
                                        checked: user.Active,
                                        onchange: function (e) { user.Active = e.target.checked }
                                    }),
                                    m("i.form-icon"), "Aktiv"),
                            ),
                            m(".form-group",
                                m("label.form-label[for=id-descr]", "Beschreibung:"),
                                m("input.form-input[type=text][id=id-descr][placeholder=Beschreibung]", {
                                    value: user.Description,
                                    oninput: function (e) { user.Description = e.target.value }
                                })
                            ),
                            !create &&
                            m(".form-group",
                                m("label.form-switch",
                                    m("input[type=checkbox]", {
                                        checked: changePwd,
                                        onchange: function (e) { changePwd = e.target.checked }
                                    }),
                                    m("i.form-icon"), "Passwort ändern"),
                            ),
                            m("fieldset", { disabled: !changePwd },
                                m(".form-group",
                                    m("label.form-label[for=pwd-input]", "Passwort:"),
                                    m("input.form-input[type=password][id=pwd-input][placeholder=Passwort]", {
                                        class: pwdOk ? "is-success" : "is-error",
                                        value: user.Password,
                                        oninput: function (e) { user.Password = e.target.value }
                                    }),
                                    m("label.form-label[for=pwdchk-input]", "Passwortwiederholung:"),
                                    m("input.form-input[type=password][id=pwdchk-input][placeholder=Passwort]", {
                                        class: pwdOk ? "is-success" : "is-error",
                                        value: pwdCheck,
                                        oninput: function (e) { pwdCheck = e.target.value }
                                    })
                                ),
                            ),
                        ),
                    ),
                    m(".modal-footer",
                        m(".btn-group",
                            m("button.btn", {
                                class: allOk ? "" : "disabled",
                                onclick: function () { vnode.attrs.onclose(user) }
                            }, "Übernehmen"),
                            m("button.btn", { onclick: function () { vnode.attrs.onclose(null) } }, "Verwerfen"),
                        ),
                    ),
                )
            )
        }
    }
}

// Config component
function Config() {
    var config
    var modified = false
    var errorMessage

    var userModal = false
    var editedUser

    function fetch() {
        m.request("/~vendor/config/~pv").then(function (resp) {
            if (resp.v !== undefined) {
                config = resp.v
                modified = false
                errorMessage = null
            } else {
                errorMessage = "Ungültiges JSON-Objekt als Konfiguration!"
            }
        }).catch(function (e) {
            errorMessage = errorToString(e)
        })
    }

    function save() {
        m.request("/~vendor/config/~pv", {
            method: "PUT",
            body: { "v": config }
        }).then(function () {
            errorMessage = null
            fetch()
        }).catch(function (e) {
            errorMessage = errorToString(e)
        })
    }

    function startEditUser(user) {
        editedUser = user
        userModal = true
    }

    function endEditUser(user) {
        userModal = false
        // aborted?
        if (user == null) {
            return
        }
        // delete old user data, if present
        if (editedUser != null) {
            delete config.Users[editedUser.Identifier]
        }
        // delete encrypted password on password change
        if (user.Password.length > 0) {
            user.EncryptedPassword = ""
        }
        // store new user
        config.Users[user.Identifier] = user
        modified = true
    }

    function deleteUser(user) {
        delete config.Users[user.Identifier]
        modified = true
    }

    function viewLogging() {
        const lvl = config.Logging.Level
        return m(".form-group",
            m("label.form-label[for=logseverity]", "Mindeste Dringlichkeit der auszugebenden Log-Meldungen. " +
                "Die Einstellungen DEBUG oder TRACE sollten nur temporär aktiviert werden:"),
            m("select.form-select#logseverity[style=width:auto]", {
                onchange: function (e) {
                    config.Logging.Level = e.target.value
                    modified = true
                }
            },
                m("option[value=OFF]", { selected: lvl === "OFF" }, "OFF (keine Meldungen)"),
                m("option[value=ERROR]", { selected: lvl === "ERROR" }, "ERROR (Fehler)"),
                m("option[value=WARNING]", { selected: lvl === "WARNING" }, "WARNING (Warnungen)"),
                m("option[value=INFO]", { selected: lvl === "INFO" }, "INFO (Allg. Informationen)"),
                m("option[value=DEBUG]", { selected: lvl === "DEBUG" }, "DEBUG (Entwicklermeldungen)"),
                m("option[value=TRACE]", { selected: lvl === "TRACE" }, "TRACE (erw. Entwicklermeldungen)")
            )
        )
    }

    function viewCCU() {
        const itfs = config.CCU.Interfaces || []
        const wiredName = "BidCosWired"
        const cuxdName = "CUxD"
        return m(".form-group",
            m("label.form-switch",
                m("input[type=checkbox]", {
                    checked: itfs.includes(wiredName),
                    onchange: function (e) {
                        if (e.target.checked) {
                            itfs.push(wiredName)
                        } else {
                            const idx = itfs.indexOf(wiredName)
                            itfs.splice(idx, 1)
                        }
                        modified = true
                    }
                }),
                m("i.form-icon"), "BidCos-Wired Geräte (HMW-...) anbinden", m("br"),
                "Achtung: Neustart vom CCU-Jack ist erforderlich! Falls virtuelle Geräte ebenfalls aktiviert sind, ist ein Neustart der CCU notwendig!"
            ),
            m("label.form-switch",
                m("input[type=checkbox]", {
                    checked: itfs.includes(cuxdName),
                    onchange: function (e) {
                        if (e.target.checked) {
                            itfs.push(cuxdName)
                        } else {
                            const idx = itfs.indexOf(cuxdName)
                            itfs.splice(idx, 1)
                        }
                        modified = true
                    }
                }),
                m("i.form-icon"), "CUxD Geräte anbinden", m("br"),
                "Achtung: Neustart vom CCU-Jack ist erforderlich! Falls virtuelle Geräte ebenfalls aktiviert sind, ist ein Neustart der CCU notwendig!"
            ),
            m("label.form-switch",
                m("input[type=checkbox]", {
                    checked: config.VirtualDevices.Enable,
                    onchange: function (e) {
                        if (e.target.checked) {
                            config.VirtualDevices.Enable = true
                        } else {
                            config.VirtualDevices.Enable = false
                        }
                        modified = true
                    }
                }),
                m("i.form-icon"), "Virtuelle Geräte aktivieren", m("br"),
                "Achtung: Virtuelle Geräte funktionieren nur dann, wenn der CCU-Jack als Add-On auf der CCU installiert wurde. ",
                "Ein Neustart der CCU ist erforderlich! Eine neue Geräteschnittstelle wird zur Projektierung der CCU hinzugefügt. ",
                "Der Hersteller der CCU kann unter Umständen Support-Leistungen ablehnen. Dies betrifft generell jede zusätzlich ",
                "installierte Software auf der CCU."
            ),
        )
    }

    function viewUsers() {
        const users = Object.values(config.Users).sort(function (a, b) {
            return a.Identifier.toLowerCase().localeCompare(b.Identifier.toLowerCase())
        })
        const allowAll = !users.some(u => u.Active)
        return [
            allowAll &&
            m(".toast.toast-warning",
                m("p", "Da keine aktiven Benutzer existieren, besteht Vollzugriff für unangemeldete Benutzer!")
            ),
            users.length > 0 &&
            m("table.table",
                m("thead",
                    m("tr",
                        m("th", "Anmeldekennung"),
                        m("th", "Aktiv"),
                        m("th", "Beschreibung"),
                        m("th"),
                    ),
                ),
                m("tbody",
                    users.map(function (user) {
                        return m("tr",
                            m("td", user.Identifier),
                            m("td", user.Active ? "Ja" : "Nein"),
                            m("td", user.Description),
                            m("td",
                                m("button.btn.btn-sm", { onclick: function () { deleteUser(user) } }, m("i.icon.icon-delete")),
                                m("button.btn.btn-sm.ml-2", { onclick: function () { startEditUser(user) } }, m("i.icon.icon-edit"))
                            )
                        )
                    })
                )
            ),
            m(".btn-group.float-left",
                m("button.btn.my-2", { onclick: function () { startEditUser(null) } }, "Berechtigung anlegen"),
            )
        ]
    }

    function viewError() {
        return m(".toast.toast-error.my-2",
            m("h4", "Fehler"),
            m("p", "Beschreibung: " + errorMessage),
        )
    }

    function viewConfig() {
        if (config == null) {
            return m("p", "Lade Konfiguration...")
        } else {
            return [
                modified &&
                m(".toast.toast-warning",
                    m("p", "Konfigurationsänderungen sind noch nicht gespeichert!")
                ),
                m(".accordion",
                    m("input[type=checkbox][id=acc-logging][hidden=hidden]"),
                    m("label.accordion-header[for=acc-logging]", m("i.icon.icon-arrow-right.mr-1"), "Logging"),
                    m(".accordion-body", viewLogging())
                ),
                m(".accordion",
                    m("input[type=checkbox][id=acc-ccu][hidden=hidden]"),
                    m("label.accordion-header[for=acc-ccu]", m("i.icon.icon-arrow-right.mr-1"), "CCU-Anbindung"),
                    m(".accordion-body", viewCCU())
                ),
                m(".accordion",
                    m("input[type=checkbox][id=acc-users][hidden=hidden]"),
                    m("label.accordion-header[for=acc-users]", m("i.icon.icon-arrow-right.mr-1"), "Zugriffsberechtigungen"),
                    m(".accordion-body", viewUsers())
                ),
                modified &&
                m(".btn-group.float-right",
                    m("button.btn.my-2", { onclick: save }, "Konfiguration speichern"),
                    m("button.btn.my-2", { onclick: fetch }, "Verwerfen")
                ),
                userModal &&
                m(UserModal, {
                    user: editedUser,
                    onclose: function (user) { endEditUser(user) },
                })
            ]
        }
    }

    // mithril component
    return {
        oninit: function (vnode) {
            fetch()
        },
        view: function (vnode) {
            return [
                m("h1", "Konfiguration"),
                errorMessage ? viewError() : viewConfig()
            ]
        }
    }
}