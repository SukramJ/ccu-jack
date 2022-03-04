package mqtt

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"strings"
	"sync"
	"time"

	"github.com/mdzio/go-logging"
	"github.com/mdzio/go-mqtt/message"
	"github.com/mdzio/go-mqtt/service"
	"github.com/mdzio/go-veap"
)

var log = logging.Get("mqtt-server")

// Server for MQTT.
type Server struct {
	// Binding address for serving MQTT.
	Addr string
	// Binding address for serving Secure MQTT.
	AddrTLS string
	// Certificate file for Secure MQTT.
	CertFile string
	// Private key file for Secure MQTT.
	KeyFile string
	// Authenticator specifies the authenticator. Default is "mockSuccess".
	Authenticator string
	// When an error happens while serving (e.g. binding of port fails), this
	// error is sent to the channel ServeErr.
	ServeErr chan<- error

	server     *service.Server
	doneServer sync.WaitGroup
}

// Start starts the MQTT server.
func (b *Server) Start() {
	b.server = &service.Server{
		Authenticator: b.Authenticator,
	}

	// start MQTT listener
	if b.Addr != "" {
		b.doneServer.Add(1)
		go func() {
			log.Infof("Starting MQTT listener on address %s", b.Addr)
			err := b.server.ListenAndServe(b.Addr)
			// signal server is down
			b.doneServer.Done()
			// check for error
			if err != nil {
				// signal error while serving
				if b.ServeErr != nil {
					b.ServeErr <- fmt.Errorf("Running MQTT server failed: %v", err)
				}
			}
		}()
	}

	// start Secure MQTT listener
	if b.AddrTLS != "" {
		b.doneServer.Add(1)
		go func() {
			log.Infof("Starting Secure MQTT listener on address %s", b.AddrTLS)
			// TLS configuration
			cer, err := tls.LoadX509KeyPair(b.CertFile, b.KeyFile)
			if err != nil {
				// signal error while serving
				b.doneServer.Done()
				if b.ServeErr != nil {
					b.ServeErr <- fmt.Errorf("Running Secure MQTT server failed: %v", err)
				}
				return
			}
			config := &tls.Config{Certificates: []tls.Certificate{cer}}
			// start server
			err = b.server.ListenAndServeTLS(b.AddrTLS, config)
			// signal server is down
			b.doneServer.Done()
			// check for error
			if err != nil {
				// signal error while serving
				if b.ServeErr != nil {
					b.ServeErr <- fmt.Errorf("Running Secure MQTT server failed: %v", err)
				}
			}
		}()
	}

}

// Stop stops the MQTT server.
func (b *Server) Stop() {
	// stop server
	log.Debugf("Stopping MQTT server")
	_ = b.server.Close()

	// wait for stop
	b.doneServer.Wait()
}

// PublishPV publishes a PV.
func (b *Server) PublishPV(topic string, pv veap.PV, qos byte, retain bool) error {
	pl, err := pvToWire(pv)
	if err != nil {
		return err
	}
	if err := b.Publish(topic, pl, qos, retain); err != nil {
		return err
	}
	return nil
}

// Publish publishes a generic payload.
func (b *Server) Publish(topic string, payload []byte, qos byte, retain bool) error {
	log.Tracef("Publishing %s: %s", topic, string(payload))
	pm := message.NewPublishMessage()
	if err := pm.SetTopic([]byte(topic)); err != nil {
		return fmt.Errorf("Invalid topic: %v", err)
	}
	if err := pm.SetQoS(qos); err != nil {
		return fmt.Errorf("Invalid QoS: %v", err)
	}
	pm.SetRetain(retain)
	pm.SetPayload(payload)
	if err := b.server.Publish(pm); err != nil {
		return fmt.Errorf("Publish failed: %v", err)
	}
	return nil
}

// Subscribe subscribes a topic.
func (b *Server) Subscribe(topic string, qos byte, onPublish *service.OnPublishFunc) error {
	return b.server.Subscribe(topic, qos, onPublish)
}

// Unsubscribe unsubscribes a topic.
func (b *Server) Unsubscribe(topic string, onPublish *service.OnPublishFunc) error {
	return b.server.Unsubscribe(topic, onPublish)
}

type wirePV struct {
	Time  int64       `json:"ts"`
	Value interface{} `json:"v"`
	State veap.State  `json:"s"`
}

var errUnexpectetContent = errors.New("Unexpectet content")

func wireToPV(payload []byte) (veap.PV, error) {
	// try to convert JSON to wirePV
	var w wirePV
	dec := json.NewDecoder(bytes.NewReader(payload))
	dec.DisallowUnknownFields()
	err := dec.Decode(&w)
	if err == nil {
		// check for unexpected content
		c, err2 := ioutil.ReadAll(dec.Buffered())
		if err2 != nil {
			return veap.PV{}, fmt.Errorf("ReadAll failed: %v", err2)
		}
		// allow only white space
		cs := strings.TrimSpace(string(c))
		if len(cs) != 0 {
			err = errUnexpectetContent
		}
	}

	// if parsing failed, take whole payload as JSON value
	if err != nil {
		var v interface{}
		err = json.Unmarshal(payload, &v)
		if err == nil {
			w = wirePV{Value: v}
		} else {
			// if no valid JSON content is found, use the whole payload as string
			w = wirePV{Value: string(payload)}
		}
	}

	// if no timestamp is provided, use current time
	var ts time.Time
	if w.Time == 0 {
		ts = time.Now()
	} else {
		ts = time.Unix(0, w.Time*1000000)
	}

	// if no state is provided, state is implicit GOOD
	return veap.PV{
		Time:  ts,
		Value: w.Value,
		State: w.State,
	}, nil
}

func pvToWire(pv veap.PV) ([]byte, error) {
	var w wirePV
	w.Time = pv.Time.UnixNano() / 1000000
	w.Value = pv.Value
	w.State = pv.State
	pl, err := json.Marshal(w)
	if err != nil {
		return nil, fmt.Errorf("Conversion of PV to JSON failed: %v", err)
	}
	return pl, nil
}
